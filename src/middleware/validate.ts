import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error-handler.js";

type ValidationRule = {
    field: string;
    required?: boolean;
    type?: "string" | "number" | "email" | "uuid" | "boolean";
    min?: number;
    max?: number;
};

export function validate(rules: ValidationRule[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        const body = req.body;

        for (const rule of rules) {
            const value = body[rule.field];

            if (rule.required && (value === undefined || value === null || value === "")) {
                throw new AppError(`${rule.field} is required`, 400);
            }

            if (value === undefined || value === null) continue;

            if (rule.type === "email") {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    throw new AppError(`${rule.field} must be a valid email`, 400);
                }
            }

            if (rule.type === "number") {
                const num = Number(value);
                if (isNaN(num)) {
                    throw new AppError(`${rule.field} must be a number`, 400);
                }
                if (rule.min !== undefined && num < rule.min) {
                    throw new AppError(`${rule.field} must be at least ${rule.min}`, 400);
                }
                if (rule.max !== undefined && num > rule.max) {
                    throw new AppError(`${rule.field} must be at most ${rule.max}`, 400);
                }
            }

            if (rule.type === "uuid") {
                const uuidRegex =
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(value)) {
                    throw new AppError(`${rule.field} must be a valid UUID`, 400);
                }
            }

            if (rule.type === "string" && typeof value !== "string") {
                throw new AppError(`${rule.field} must be a string`, 400);
            }
        }

        next();
    };
}
