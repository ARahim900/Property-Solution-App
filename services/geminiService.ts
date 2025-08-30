
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import type { InspectionItem, InspectionPhoto } from '../types';

// Fix: Adhered to @google/genai guidelines by initializing the client directly
// with the API key from environment variables, assuming it's always available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export const generateReportSummary = async (failedItems: InspectionItem[]): Promise<string> => {
  // Fix: Removed manual API key check to align with guidelines.
  const prompt = `
    You are an AI assistant for a property inspector. Your task is to generate a concise, professional, and easy-to-understand summary of findings for a property inspection report.
    Based on the following list of failed inspection points, create a summary.
    - Group related issues together (e.g., all plumbing issues, all electrical issues).
    - Start with the most critical issues.
    - Use clear headings and bullet points.
    - The tone should be objective and informative.

    Here are the failed items:
    ${failedItems.map(item => `- ${item.category} - ${item.point}: ${item.comments || 'No comment.'} (Location: ${item.location || 'General'})`).join('\n')}
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error generating report summary:", error);
    return "Error: Could not generate AI summary. Please check the console for details.";
  }
};

export const analyzeDefectImage = async (photo: InspectionPhoto, pointDescription: string): Promise<string> => {
  // Fix: Removed manual API key check to align with guidelines.
  
  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: photo.base64,
    },
  };

  const textPart = {
    text: `Analyze this image which shows a potential defect related to "${pointDescription}". Describe the issue observed in the image in a concise, factual comment for an inspection report. Focus only on what is visually present. If no clear defect is visible, state that. Start your response directly with the description.`
  };

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] }
    });
    return response.text;
  } catch (error) {
    console.error("Error analyzing defect image:", error);
    return "Error: Could not analyze image.";
  }
};
