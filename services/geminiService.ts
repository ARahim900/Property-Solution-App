import type { InspectionItem, InspectionPhoto } from '../types';

// NOTE: All API-related functionality has been removed from this file 
// to allow the application to run without an API key.

export const generateReportSummary = async (failedItems: InspectionItem[]): Promise<string> => {
  // This function is no longer called from the UI.
  return Promise.resolve("AI Summary feature disabled.");
};

export const analyzeDefectImage = async (photo: InspectionPhoto, pointDescription: string): Promise<string> => {
  // This function is no longer called from the UI.
  return Promise.resolve("AI Analysis feature disabled.");
};
