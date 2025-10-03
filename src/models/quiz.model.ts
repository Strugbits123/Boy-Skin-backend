import { ObjectId } from "mongodb";

export interface QuizModel {
    _id?: ObjectId;
    Name: string;
    Email: string;
    Age: string;
    Gender: string;
    Country: string;
    wakeUpSkinType: string;
    skinSensitivity: string;
    work_on: string;
    Budget: string;
    routine_time: string;
    additional_info: string;
    terms_accepted: string;
    newsletter_option: string;
    quizResultsDocId?: string
}

export interface AICompatibleQuizModel {
    demographics: {
        age: "18-25" | "25-35" | "35-45" | "45+";
        name: string;
    };
    skinAssessment: {
        skinType: "dry" | "oily" | "combination" | "normal";
        skinSensitivity: "sensitive" | "not sensitive";
        currentAcneStatus: "active acne" | "not active acne";
    };
    concerns: {
        primary: string[];
        secondary: string[];
    };
    preferences: {
        timeCommitment: "5_minute" | "10_minute" | "15+_minute";
        budget: string;
    };
    safetyInformation: {
        medicalConditions: string[];
        currentMedications: string[];
        knownAllergies: string[];
        additionalInfo: string;
    };
    contactInfo: {
        email: string;
        country: string;
        gender: string;
    };
}


