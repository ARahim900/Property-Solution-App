import jsPDF from 'jspdf';
import { InspectionData, InspectionArea, InspectionItem, InspectionPhoto } from '../types';
import { amiriFont } from './amiriFont';

const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const timeZoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + timeZoneOffset);

    return adjustedDate.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

const toDataURL = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn(`Could not load image ${url}:`, error);
        return null;
    }
};

const arabicRegex = /[\u0600-\u06FF]/;

export class WaslaReportGenerator {
    pdf: jsPDF;
    pageWidth: number;
    pageHeight: number;
    margins: { top: number; right: number; bottom: number; left: number };
    contentWidth: number;
    currentY: number;
    logoBase64: string | null = null;
    watermarkBase64: string | null = null;

    constructor() {
        this.pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        this.pageWidth = this.pdf.internal.pageSize.getWidth();
        this.pageHeight = this.pdf.internal.pageSize.getHeight();
        this.margins = { top: 25, right: 15, bottom: 25, left: 15 };
        this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
        this.currentY = this.margins.top;

        this.pdf.addFileToVFS('Amiri-Regular.ttf', amiriFont);
        this.pdf.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
        this.pdf.addFont('Amiri-Regular.ttf', 'Amiri', 'bold');
    }
    
    setEnglishFont(style: 'normal' | 'bold' = 'normal') {
        this.pdf.setFont('helvetica', style);
    }
    
    setArabicFont(style: 'normal' | 'bold' = 'normal') {
        this.pdf.setFont('Amiri', style);
    }

    async initialize() {
        // A generic logo URL is used here. For a real application, this would be a brand asset.
        this.logoBase64 = await toDataURL('https://i.ibb.co/bF9gV3j/wasla-logo.png');
        this.watermarkBase64 = await toDataURL('https://i.ibb.co/bF9gV3j/wasla-logo.png');
    }

    addHeader() {
        if (this.logoBase64) {
            this.pdf.addImage(this.logoBase64, 'PNG', this.margins.left, 8, 25, 12.5);
        }
        this.setEnglishFont('bold');
        this.pdf.setFontSize(9);
        this.pdf.setTextColor(100, 100, 100);
        this.pdf.text('Property Inspection Report', this.pageWidth - this.margins.right, 15, { align: 'right' });
        
        this.pdf.setDrawColor(220, 220, 220);
        this.pdf.line(this.margins.left, 20, this.pageWidth - this.margins.right, 20);
        this.pdf.setTextColor(0, 0, 0);
    }

    addFooter(pageNum: number, totalPages: number, inspection: InspectionData) {
        const footerY = this.pageHeight - 15;
        this.pdf.setDrawColor(220, 220, 220);
        this.pdf.line(this.margins.left, footerY - 3, this.pageWidth - this.margins.right, footerY - 3);

        this.setEnglishFont();
        this.pdf.setFontSize(8);
        this.pdf.setTextColor(100, 100, 100);

        const footerTextLeft = `${inspection.clientName} | ${inspection.propertyLocation}`;
        const truncatedLeft = this.pdf.splitTextToSize(footerTextLeft, this.contentWidth / 2)[0];
        this.pdf.text(truncatedLeft, this.margins.left, footerY);

        const footerTextRight = `Page ${pageNum} of ${totalPages}`;
        this.pdf.text(footerTextRight, this.pageWidth - this.margins.right, footerY, { align: 'right' });
        this.pdf.setTextColor(0, 0, 0);
    }
    
    addHeadersAndFooters(inspection: InspectionData) {
        const pageCount = this.pdf.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            this.pdf.setPage(i);
            this.addHeader();
            this.addFooter(i, pageCount, inspection);
        }
    }

    checkPageBreak(requiredSpace = 20) {
        if (this.currentY + requiredSpace > this.pageHeight - this.margins.bottom) {
            this.addPage();
            return true;
        }
        return false;
    }

    addPage() {
        this.pdf.addPage();
        this.addWatermark();
        this.currentY = this.margins.top;
    }

    addWatermark() {
        if (this.watermarkBase64) {
            const watermarkSize = 90;
            this.pdf.saveGraphicsState();
            this.pdf.setGState(this.pdf.GState({ opacity: 0.08 }));
            this.pdf.addImage(
                this.watermarkBase64, 'PNG',
                (this.pageWidth - watermarkSize) / 2,
                (this.pageHeight - watermarkSize) / 2,
                watermarkSize, watermarkSize
            );
            this.pdf.restoreGraphicsState();
        }
    }
    
    addSectionHeader(englishTitle: string, arabicTitle: string) {
        this.checkPageBreak(15);
        
        const headerHeight = 10;
        
        // Background
        this.pdf.setFillColor(241, 245, 249); // slate-100
        this.pdf.rect(this.margins.left, this.currentY, this.contentWidth, headerHeight, 'F');
        
        // Accent line
        this.pdf.setFillColor(37, 99, 235); // blue-600
        this.pdf.rect(this.margins.left, this.currentY, 1.5, headerHeight, 'F');

        // English Title
        this.pdf.setFontSize(12);
        this.setEnglishFont('bold');
        this.pdf.setTextColor(30, 41, 59); // slate-800
        this.pdf.text(englishTitle.toUpperCase(), this.margins.left + 5, this.currentY + headerHeight / 2, { baseline: 'middle' });

        // Arabic Title
        this.setArabicFont('bold');
        this.pdf.text(arabicTitle, this.pageWidth - this.margins.right - 3, this.currentY + headerHeight / 2, { align: 'right', lang: 'ar', baseline: 'middle' } as any);
        
        this.pdf.setTextColor(0, 0, 0);
        this.currentY += headerHeight + 5;
    }


    addTwoColumnText(englishText: string, arabicText: string, options: { isBold?: boolean, fontSize?: number } = {}) {
        const { isBold = false, fontSize = 9 } = options;
        const colWidth = (this.contentWidth - 10) / 2;
        const leftColX = this.margins.left;
        const rightColX = this.pageWidth - this.margins.right;
        
        const lineHeightFactor = 1.35; // Increased for better readability, especially for Arabic
        const ptToMm = 1 / this.pdf.internal.scaleFactor; // Provides accurate pt to mm conversion
        const lineHeight = fontSize * ptToMm * lineHeightFactor;

        this.setEnglishFont(isBold ? 'bold' : 'normal');
        this.pdf.setFontSize(fontSize);
        const englishLines = this.pdf.splitTextToSize(englishText, colWidth);
        
        this.setArabicFont(isBold ? 'bold' : 'normal');
        this.pdf.setFontSize(fontSize);
        const arabicLines = this.pdf.splitTextToSize(arabicText, colWidth);
        
        const requiredSpace = Math.max(englishLines.length, arabicLines.length) * lineHeight;
        this.checkPageBreak(requiredSpace);

        this.setEnglishFont(isBold ? 'bold' : 'normal');
        this.pdf.setFontSize(fontSize);
        this.pdf.text(englishLines, leftColX, this.currentY, { 
            align: 'justify',
            lineHeightFactor: lineHeightFactor
        });

        this.setArabicFont(isBold ? 'bold' : 'normal');
        this.pdf.setFontSize(fontSize);
        this.pdf.text(arabicLines, rightColX, this.currentY, { 
            align: 'right', 
            lang: 'ar',
            lineHeightFactor: lineHeightFactor
        } as any);
        
        this.currentY += requiredSpace + 4;
    }
    
    addFixedDisclaimer(inspection: InspectionData) {
        this.addWatermark();
        if (this.logoBase64) {
            this.pdf.addImage(this.logoBase64, 'PNG', (this.pageWidth - 60) / 2, this.currentY, 60, 30);
            this.currentY += 35;
        }

        this.addSectionHeader('OVERVIEW', 'نظرة عامة');
        this.addTwoColumnText(`Dear Mr. ${inspection.clientName},`, `الأفاضل/ ${inspection.clientName} المحترمون`, { isBold: true, fontSize: 10 });
        this.addTwoColumnText(
            `Thank you for choosing Wasla Real Estate Solutions to carry out the inspection of your property. This report presents the inspection findings and measurements as documented on site on the date of the visit, and the presence of certain observations is common in property inspections.\n\nPlease review the attached report carefully before making your final decision. If you require any further clarification regarding the condition of the property, please feel free to contact us by phone or email between 9:00 a.m. and 5:00 p.m.\n\nEmail: info@waslaoman.com\nMobile: +968 90699799`,
            `نشكر لكم اختياركم "وصلة للحلول العقارية" للقيام بفحص العقار الخاص بكم. يُقدم هذا التقرير نتائج الفحص والقياسات كما تم توثيقها ميدانيًا في تاريخ الزيارة، ووجود بعض الملاحظات يُعد أمر شائع في عمليات الفحص العقاري.\n\nيرجى مراجعة التقرير المرفق بعناية قبل اتخاذ قراركم النهائي، و إذا كنتم بحاجة إلى توضيحات إضافية حول حالة العقار، فلا تترددوا بالتواصل معنا عبر الهاتف أو البريد الإلكتروني من الساعة 9 صباحًا حتى 5 مساءً على وسائل التواصل التالية:\n\nالبريد الإلكتروني: info@waslaoman.com\nالهاتف: +968 90699799`
        );
        
        this.addTwoColumnText('No property is perfect.', 'لا يوجد عقار مثالي', { isBold: true });
        this.addTwoColumnText(
            `Every building has imperfections or items that are ready for maintenance. It’s the inspector’s task to discover and report these so you can make informed decisions. This report should not be used as a tool to demean property, but rather as a way to illuminate the realities of the property.`,
            `كل عقار يحتوي على بعض العيوب أو الأجزاء التي تحتاج إلى صيانة. دور المفتش هو تحديد هذه النقاط وتقديمها بوضوح لمساعدتكم في اتخاذ قرارات مستنيرة. هذا التقرير لا يُقصد به التقليل من قيمة العقار، وإنما يهدف إلى توضيح الحالة الواقعية له.`
        );

        this.addTwoColumnText('This report is not an appraisal.', 'هذا التقرير ليس تقييمًا سعريًا', { isBold: true });
        this.addTwoColumnText(
            `When an appraiser determines worth, only the most obvious conditions of a property are taken into account to establish a safe loan amount. In effect, the appraiser is representing the interests of the lender. Home inspectors focus more on the interests of the prospective buyer; and, although inspectors must be careful not to make any statements relating to property value, their findings can help buyers more completely understand the true costs of ownership.`,
            `عند قيام المثمن بتحديد قيمة العقار، فإنه يأخذ بعين الاعتبار فقط العيوب الظاهرة لتقدير مبلغ قرض آمن. بمعنى آخر، فإن المثمن يُمثل مصلحة الجهة المُقرضة. أما فاحص العقار، فيركز على مصلحة المشتري المحتمل. ورغم أن المفتش لا يحدد قيمة العقار، إلا أن نتائج الفحص تساعد المشتري في فهم التكاليف الحقيقية لامتلاك العقار.`
        );
        
        this.addPage();

        this.addTwoColumnText('Maintenance costs are normal.', 'تكاليف الصيانة أمر طبيعي', { isBold: true });
        this.addTwoColumnText(
            `Homeowners should plan to spend around 1% of the total value of a property in maintenance costs, annually. (Annual costs of rental property maintenance are often 2%, or more.) If considerably less than this percentage has been invested during several years preceding an inspection, the property will usually show the obvious signs of neglect; and the new property owners may be required to invest significant time and money to address accumulated maintenance needs.`,
            `ينبغي على مالكي العقارات تخصيص ما يُعادل 1% من قيمة العقار سنويًا لأعمال الصيانة الدورية. أما العقارات المؤجرة فقد تصل النسبة إلى 2% أو أكثر. وإذا لم يتم استثمار هذه النسبة على مدى عدة سنوات، فستظهر مؤشرات واضحة على الإهمال، مما يُحتم على المالك الجديد دفع تكاليف كبيرة لاحقًا لمعالجة هذه الإهمالات.`
        );

        this.addSectionHeader('SCOPE OF THE INSPECTION', 'نطاق الفحص');
        this.addTwoColumnText(
            `This report details the outcome of a visual survey of the property detailed in the annexed inspection checklist in order to check the quality of workmanship against applicable standards. It covers both the interior and the exterior of the property as well as garden, driveway and garage if relevant. Areas not inspected, for whatever reason, cannot guarantee that these areas are free from defects.\n\nThis report was formed as per the client request as a supportive opinion to enable him to have better understanding about property conditions. Our opinion does not study the property value or the engineering of the structure rather it studies the functionality of the property. This report will be listing the property defects supported by images and videos, by showing full study of the standards of property status and functionality including other relevant elements of the property as stated in the checklist.`,
            `يوضح هذا التقرير نتيجة الفحص البصري للعقار كما هو مفصل في قائمة الفحص المرفقة، بهدف تقييم جودة التنفيذ مقارنة بالمعايير المعتمدة. يشمل الفحص المناطق الداخلية والخارجية، بالإضافة إلى الحديقة، والممر، والجراج ( إن وُجد). كما لا يمكن ضمان خلو المناطق غير المفحوصة من العيوب لأي سببٍ كان.\n\nوقد تم إعداد هذا التقرير بناءً على طلب العميل لتقديم رأي داعم يساعده على فهم حالة العقار بشكل أفضل. رأينا الفني لا يشمل تقييم القيمة السوقية أو التحليل الإنشائي، بل يركز على حالة العقار ووظائفه العامة. كما سيتم سرد العيوب المرصودة بناءً على دراسة كاملة لمعايير الحالة والأداء الوظيفي للعقار مشمولة بالصور والفيديوهات، إلى جانب العناصر الأخرى ذات الصلة كما هو موضح في قائمة الفحص.`
        );

        this.addSectionHeader('CONFIDENTIALITY OF THE REPORT', 'سرية التقرير');
        this.addTwoColumnText(
            `The inspection report is to be prepared for the Client for the purpose of informing of the major deficiencies in the condition of the subject property and is solely and exclusively for Client’s own information and may not be relied upon by any other person. Client may distribute copies of the inspection report to the seller and the real estate agents directly involved in this transaction, but Client and Inspector do not in any way intend to benefit said seller or the real estate agents directly or indirectly through this Agreement or the inspection report. In the event that the inspection report has been prepared for the SELLER of the subject property, an authorized representative of Wasla Real Estate Solutions will return to the property, for a fee, to meet with the BUYER for a consultation to provide a better understanding of the reported conditions and answer.`,
            `تم إعداد تقرير الفحص هذا خصيصًا للعميل بغرض إعلامه بالنواقص الجوهرية في حالة العقار محل الفحص، وهو للاستخدام الشخصي فقط ولا يجوز الاعتماد عليه من قبل أي طرف آخر. يجوز للعميل مشاركة نسخة من التقرير مع البائع أو وكلاء العقارات المعنيين بهذه الصفقة، إلا أن كل من العميل والفاحص لا يقصدان من خلال هذا التقرير تحقيق أي منفعة مباشرة أو غير مباشرة لهؤلاء الأطراف. وفي حال تم إعداد هذا التقرير بطلب من البائع، فإن ممثلًا معتمدًا من شركة وصلة لحلول العقار سيعود إلى العقار – مقابل رسوم – لعقد جلسة استشارية עם المشتري بهدف توضيح الملاحظات الواردة في التقرير والإجابة عن استفساراته.`
        );

        this.currentY += 5;
        this.pdf.setDrawColor(220, 220, 220);
        this.pdf.line(this.margins.left, this.currentY, this.pageWidth - this.margins.right, this.currentY);
        this.currentY += 8;

        const colWidth = this.contentWidth / 2;
        const leftColX = this.margins.left;
        const rightColX = this.pageWidth - this.margins.right;
        let startY = this.currentY;

        this.setEnglishFont('bold');
        this.pdf.text('Client Name:', leftColX, startY);
        this.setEnglishFont();
        this.pdf.text(inspection.clientName, leftColX + 30, startY);
        
        this.setEnglishFont('bold');
        this.pdf.text('Signature:', leftColX, startY + 8);
        this.pdf.setDrawColor(180, 180, 180);
        this.pdf.line(leftColX + 30, startY + 8, leftColX + colWidth - 5, startY + 8);

        this.setEnglishFont('bold');
        this.pdf.text('Prepared by:', leftColX, startY + 16);
        this.setEnglishFont();
        this.pdf.text(inspection.inspectorName, leftColX + 30, startY + 16);

        this.setEnglishFont('bold');
        this.pdf.text('Stamp:', leftColX, startY + 24);

        this.setEnglishFont('bold');
        this.pdf.text('Date:', leftColX, startY + 32);
        this.setEnglishFont();
        this.pdf.text(formatDate(inspection.inspectionDate), leftColX + 30, startY + 32);

        this.setEnglishFont();
        this.pdf.setFontSize(8);
        this.pdf.text('Property Inspection report is annexed', leftColX, startY + 42);
        this.pdf.text('Wasla Property Solutions CR. 1068375', leftColX, startY + 47);

        this.setArabicFont('bold');
        this.pdf.text('اسم العميل:', rightColX, startY, { align: 'right', lang: 'ar'} as any);
        this.setArabicFont();
        this.pdf.text(inspection.clientName, rightColX - 30, startY, { align: 'right', lang: 'ar'} as any);

        this.setArabicFont('bold');
        this.pdf.text('التوقيع:', rightColX, startY + 8, { align: 'right', lang: 'ar'} as any);
        this.pdf.line(rightColX - 30, startY + 8, rightColX - colWidth + 5, startY + 8);

        this.setArabicFont('bold');
        this.pdf.text('أعد التقرير بواسطة:', rightColX, startY + 16, { align: 'right', lang: 'ar'} as any);
        this.setArabicFont();
        this.pdf.text(inspection.inspectorName, rightColX - 30, startY + 16, { align: 'right', lang: 'ar'} as any);

        this.setArabicFont('bold');
        this.pdf.text('الختم:', rightColX, startY + 24, { align: 'right', lang: 'ar'} as any);

        this.setArabicFont('bold');
        this.pdf.text('التاريخ:', rightColX, startY + 32, { align: 'right', lang: 'ar'} as any);
        this.setArabicFont();
        this.pdf.text(formatDate(inspection.inspectionDate), rightColX - 30, startY + 32, { align: 'right', lang: 'ar'} as any);

        this.setArabicFont();
        this.pdf.setFontSize(8);
        this.pdf.text('مرفق تقرير الفحص', rightColX, startY + 42, { align: 'right', lang: 'ar'} as any);
        this.pdf.text('وصلة للحلول العقارية س ت 1068375', rightColX, startY + 47, { align: 'right', lang: 'ar'} as any);
    }

    addAISummary(summary: string) {
        this.addPage();
        this.addSectionHeader('Executive AI Summary', 'ملخص الذكاء الاصطناعي');
        
        this.setEnglishFont();
        this.pdf.setFontSize(10);
        const summaryLines = this.pdf.splitTextToSize(summary, this.contentWidth - 10);
        const requiredHeight = summaryLines.length * 5 + 10;
        this.checkPageBreak(requiredHeight + 5);

        // Draw a background box
        this.pdf.setFillColor(248, 252, 254); // blue-50
        this.pdf.roundedRect(this.margins.left, this.currentY, this.contentWidth, requiredHeight, 3, 3, 'F');
        this.pdf.setDrawColor(191, 219, 254); // blue-200
        this.pdf.roundedRect(this.margins.left, this.currentY, this.contentWidth, requiredHeight, 3, 3, 'S');

        this.pdf.text(summaryLines, this.margins.left + 5, this.currentY + 8);
        this.currentY += requiredHeight + 10;
    }
    
    addInspectionDetails(inspection: InspectionData) {
        this.addPage();
        this.addSectionHeader('INSPECTION FINDINGS', 'نتائج الفحص');
        
        if (inspection.areas && inspection.areas.length > 0) {
            for (const area of inspection.areas) {
                if (area.items && area.items.length > 0) {
                    this.addAreaSection(area);
                }
            }
        } else {
            this.setEnglishFont();
            this.pdf.setFontSize(10);
            this.pdf.text('No inspection items were recorded for this property.', this.margins.left, this.currentY);
            this.currentY += 10;
        }
    }

    addAreaSection(area: InspectionArea) {
        this.checkPageBreak(20);

        const isAreaNameArabic = arabicRegex.test(area.name);
        if (isAreaNameArabic) {
            this.setArabicFont('bold');
        } else {
            this.setEnglishFont('bold');
        }
        
        this.pdf.setFontSize(14);
        this.pdf.setTextColor(37, 99, 235); // blue-600
        const textX = isAreaNameArabic ? this.pageWidth - this.margins.right : this.margins.left;
        this.pdf.text(area.name, textX, this.currentY, {
            align: isAreaNameArabic ? 'right' : 'left',
            lang: isAreaNameArabic ? 'ar' : undefined,
        } as any);

        this.currentY += 6;
        this.pdf.setDrawColor(59, 130, 246); // blue-500
        this.pdf.line(this.margins.left, this.currentY, this.pageWidth - this.margins.right, this.currentY);
        this.currentY += 8;
        this.pdf.setTextColor(0, 0, 0);


        for (const item of area.items) {
            this.addInspectionItem(item);
        }
    }

    addInspectionItem(item: InspectionItem) {
        const itemStartY = this.currentY;
        this.checkPageBreak(30);
        
        // Calculate status badge size first
        this.setEnglishFont('bold');
        this.pdf.setFontSize(8);
        const statusText = item.status.toUpperCase();
        const statusWidth = this.pdf.getTextWidth(statusText) + 8;
        const statusX = this.pageWidth - this.margins.right - statusWidth - 2;

        // Draw title
        const titleAvailableWidth = this.contentWidth - statusWidth - 10; // 5 for gap
        const itemTitle = item.point || 'Inspection Point';
        const isTitleArabic = arabicRegex.test(itemTitle);
        
        if (isTitleArabic) {
            this.setArabicFont('bold');
        } else {
            this.setEnglishFont('bold');
        }
        this.pdf.setFontSize(11);
        
        const itemTitleLines = this.pdf.splitTextToSize(itemTitle, titleAvailableWidth);
        const titleX = isTitleArabic ? statusX - 5 : this.margins.left + 2;
        this.pdf.text(itemTitleLines, titleX, this.currentY + 4, { align: isTitleArabic ? 'right' : 'left', lang: isTitleArabic ? 'ar' : undefined } as any);

        // Draw status badge
        const statusColors = { 'Pass': [22, 101, 52], 'Fail': [153, 27, 27], 'N/A': [51, 65, 85] }; // green-800, red-800, slate-800
        const color = statusColors[item.status] || [0, 0, 0];
        const statusBgColors = { 'Pass': [220, 252, 231], 'Fail': [254, 226, 226], 'N/A': [226, 232, 240] }; // green-100, red-100, slate-200
        const bgColor = statusBgColors[item.status];
        
        this.pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        this.pdf.roundedRect(statusX, this.currentY, statusWidth, 6, 2, 2, 'F');
        this.pdf.setTextColor(color[0], color[1], color[2]);
        this.setEnglishFont('bold'); // status is always english
        this.pdf.setFontSize(8);
        this.pdf.text(statusText, statusX + 4, this.currentY + 4);
        
        this.pdf.setTextColor(0, 0, 0);
        const titleHeight = itemTitleLines.length * 5;
        this.currentY += titleHeight + 4;

        // Draw details if they exist
        const hasDetails = item.location || item.comments;
        // FIX: Hoisted variable declarations to make them available in the redraw section below.
        const detailIndent = this.margins.left + 4;
        const detailWidth = this.contentWidth - 8;
        if(hasDetails) {
            this.currentY += 2;
            this.pdf.setDrawColor(226, 232, 240); // slate-200
            this.pdf.line(this.margins.left + 2, this.currentY, this.pageWidth - this.margins.right - 2, this.currentY);
            this.currentY += 4;
            
            this.setEnglishFont('normal');
            this.pdf.setFontSize(9);
            
            if (item.location) {
                this.checkPageBreak(5);
                this.setEnglishFont('bold');
                this.pdf.text('Location:', detailIndent, this.currentY);
                
                const isLocationArabic = arabicRegex.test(item.location);
                if (isLocationArabic) {
                    this.setArabicFont('normal');
                } else {
                    this.setEnglishFont('normal');
                }
                
                const availableWidth = detailWidth - 18;
                const locText = this.pdf.splitTextToSize(item.location, availableWidth);
                const textX = isLocationArabic ? detailIndent + 18 + availableWidth : detailIndent + 18;
                this.pdf.text(locText, textX, this.currentY, {
                     align: isLocationArabic ? 'right' : 'left',
                     lang: isLocationArabic ? 'ar' : undefined,
                } as any);
                this.currentY += locText.length * 4;
            }
            if (item.comments) {
                this.checkPageBreak(5);
                this.setEnglishFont('bold');
                this.pdf.text('Comments:', detailIndent, this.currentY);
    
                const isCommentsArabic = arabicRegex.test(item.comments);
                if (isCommentsArabic) {
                    this.setArabicFont('normal');
                } else {
                    this.setEnglishFont('normal');
                }
    
                const availableWidth = detailWidth - 20;
                const comText = this.pdf.splitTextToSize(item.comments, availableWidth);
                const textX = isCommentsArabic ? detailIndent + 20 + availableWidth : detailIndent + 20;
                this.pdf.text(comText, textX, this.currentY, {
                     align: isCommentsArabic ? 'right' : 'left',
                     lang: isCommentsArabic ? 'ar' : undefined,
                } as any);
                this.currentY += comText.length * 4;
            }
        }


        if (item.photos && item.photos.length > 0) {
            this.currentY += (hasDetails ? 2 : 4);
            this.addPhotos(item.photos);
        }
        
        // Draw border around the item
        const itemEndY = this.currentY + 2;
        this.pdf.setFillColor(248, 250, 252); // slate-50
        this.pdf.roundedRect(this.margins.left, itemStartY - 2, this.contentWidth, itemEndY - itemStartY + 2, 3, 3, 'F');

        // Re-draw content on top of background
        this.currentY = itemStartY; // Reset Y to re-draw text
        this.pdf.text(itemTitleLines, titleX, this.currentY + 4, { align: isTitleArabic ? 'right' : 'left', lang: isTitleArabic ? 'ar' : undefined } as any);
        this.pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        this.pdf.roundedRect(statusX, this.currentY, statusWidth, 6, 2, 2, 'F');
        this.pdf.setTextColor(color[0], color[1], color[2]);
        this.pdf.text(statusText, statusX + 4, this.currentY + 4);
        this.pdf.setTextColor(0, 0, 0);
        this.currentY += titleHeight + 4;
        if(hasDetails) {
            this.currentY += 6;
             if (item.location) {
                this.setEnglishFont('bold'); this.pdf.text('Location:', detailIndent, this.currentY);
                if (arabicRegex.test(item.location)) this.setArabicFont('normal'); else this.setEnglishFont('normal');
                const availableWidth = detailWidth - 18; const locText = this.pdf.splitTextToSize(item.location, availableWidth); const textX = arabicRegex.test(item.location) ? detailIndent + 18 + availableWidth : detailIndent + 18;
                this.pdf.text(locText, textX, this.currentY, { align: arabicRegex.test(item.location) ? 'right' : 'left', lang: arabicRegex.test(item.location) ? 'ar' : undefined } as any);
                this.currentY += locText.length * 4;
            }
            if (item.comments) {
                this.setEnglishFont('bold'); this.pdf.text('Comments:', detailIndent, this.currentY);
                if (arabicRegex.test(item.comments)) this.setArabicFont('normal'); else this.setEnglishFont('normal');
                const availableWidth = detailWidth - 20; const comText = this.pdf.splitTextToSize(item.comments, availableWidth); const textX = arabicRegex.test(item.comments) ? detailIndent + 20 + availableWidth : detailIndent + 20;
                this.pdf.text(comText, textX, this.currentY, { align: arabicRegex.test(item.comments) ? 'right' : 'left', lang: arabicRegex.test(item.comments) ? 'ar' : undefined } as any);
                this.currentY += comText.length * 4;
            }
        }
        if (item.photos && item.photos.length > 0) {
            this.currentY += (hasDetails ? 2 : 4);
            this.addPhotos(item.photos);
        }

        this.currentY = itemEndY + 3; // Space after each item
    }

    addPhotos(photos: InspectionPhoto[]) {
        const photosPerRow = 3;
        const gap = 3;
        const photoContainerWidth = this.contentWidth - 12;
        const photoWidth = (photoContainerWidth - ((photosPerRow - 1) * gap)) / photosPerRow;
        const photoHeight = photoWidth * 0.75;

        for (let i = 0; i < photos.length; i += photosPerRow) {
            this.checkPageBreak(photoHeight + 5);
            const rowPhotos = photos.slice(i, i + photosPerRow);
            rowPhotos.forEach((photo, j) => {
                const x = this.margins.left + 6 + j * (photoWidth + gap);
                if (photo && photo.base64) {
                    try {
                        this.pdf.addImage(`data:image/jpeg;base64,${photo.base64}`, 'JPEG', x, this.currentY, photoWidth, photoHeight);
                    } catch (error) {
                        console.warn('Failed to add photo:', error);
                    }
                }
            });
            this.currentY += photoHeight + gap;
        }
    }

    async generateReport(inspection: InspectionData): Promise<jsPDF> {
        this.currentY = this.margins.top;

        this.addFixedDisclaimer(inspection);
        
        if (inspection.aiSummary) {
            this.addAISummary(inspection.aiSummary);
        }

        this.addInspectionDetails(inspection);
        
        this.addHeadersAndFooters(inspection);
        
        return this.pdf;
    }
}
