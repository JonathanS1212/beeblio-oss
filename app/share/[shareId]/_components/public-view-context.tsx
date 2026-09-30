"use client";
import { createContext, useContext } from "react";

export const PublicViewContext = createContext<{ shareId: string | null; isOwner: boolean; projectSlug: string | null; filePath: string | null }>({ shareId: null, isOwner: false, projectSlug: null, filePath: null });
export const usePublicView = () => useContext(PublicViewContext);
