import type { Request, Response, NextFunction } from "express";

export function requireRole(
  ...roles: ("citizen" | "authority" | "higher" | "admin")[]
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !roles.includes(user.role as any)) {
      return res.status(403).json({ success: false, error: "Forbidden: insufficient role" });
    }
    next();
  };
}
