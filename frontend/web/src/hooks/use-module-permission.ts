"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useRealtimeState } from "@/components/realtime-provider";
import type { AccessLevel } from "@/lib/module-catalog";

export interface MyModulesResponse {
  success: boolean;
  role: string;
  modules: Record<string, AccessLevel>;
  disabledSections: string[];
  maskFinancials: boolean;
  disableExport: boolean;
  appliedPersonaId: string | null;
}

export function useMyModules() {
  const queryClient = useQueryClient();
  const { socket } = useRealtimeState();

  const query = useQuery<MyModulesResponse>({
    queryKey: ["my-modules-permissions"],
    queryFn: () => apiFetch<MyModulesResponse>("/permissions/my-modules"),
    staleTime: 60 * 1000, // 1 minute stale time
    refetchOnWindowFocus: true,
  });

  // Listen for real-time WebSocket push when Super Admin updates permissions or presets
  useEffect(() => {
    if (!socket) return;

    const handleGovernanceRevoked = (data: { message?: string }) => {
      // Invalidate module permissions immediately
      queryClient.invalidateQueries({ queryKey: ["my-modules-permissions"] });
    };

    socket.on("governance:revoked", handleGovernanceRevoked);

    return () => {
      socket.off("governance:revoked", handleGovernanceRevoked);
    };
  }, [socket, queryClient]);

  const modules = query.data?.modules || {};
  const disabledSections = query.data?.disabledSections || [];
  const maskFinancials = !!query.data?.maskFinancials;
  const disableExport = !!query.data?.disableExport;

  /**
   * Helper to check access for a single module
   */
  const getModuleAccess = (moduleId: string): AccessLevel => {
    if (query.data?.role === "SUPER_ADMIN") return "FULL_ACCESS";
    return modules[moduleId] || "FULL_ACCESS";
  };

  const isModuleHidden = (moduleId: string): boolean => {
    return getModuleAccess(moduleId) === "HIDDEN";
  };

  const isModuleReadOnly = (moduleId: string): boolean => {
    return getModuleAccess(moduleId) === "READ_ONLY";
  };

  const isModuleFullAccess = (moduleId: string): boolean => {
    return getModuleAccess(moduleId) === "FULL_ACCESS";
  };

  return {
    ...query,
    modules,
    disabledSections,
    maskFinancials,
    disableExport,
    appliedPersonaId: query.data?.appliedPersonaId || null,
    getModuleAccess,
    isModuleHidden,
    isModuleReadOnly,
    isModuleFullAccess,
  };
}
