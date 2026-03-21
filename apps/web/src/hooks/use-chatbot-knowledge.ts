"use client";

import { useAuth } from "@/components/auth-provider";
import { useCallback, useEffect, useState } from "react";

type KnowledgeResponse = {
  knowledgeBase: string | null;
  updatedAt?: string;
};

export function useChatbotKnowledge() {
  const { authorizedRequest } = useAuth();
  const [knowledge, setKnowledge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKnowledge = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authorizedRequest<KnowledgeResponse | null>("/settings/chatbot/knowledge");
      setKnowledge(response?.knowledgeBase ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wissensbasis konnte nicht geladen werden.");
      setKnowledge(null);
    } finally {
      setLoading(false);
    }
  }, [authorizedRequest]);

  useEffect(() => {
    void fetchKnowledge();
  }, [fetchKnowledge]);

  const saveKnowledge = useCallback(
    async (next: string | null) => {
      setSaving(true);
      try {
        await authorizedRequest<KnowledgeResponse>("/settings/chatbot/knowledge", {
          method: "PUT",
          body: JSON.stringify({ knowledgeBase: next?.trim() || null }),
        });
        setKnowledge(next?.trim() || null);
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Wissensbasis konnte nicht gespeichert werden.";
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [authorizedRequest],
  );

  return {
    knowledge,
    loadingKnowledge: loading,
    savingKnowledge: saving,
    knowledgeError: error,
    refreshKnowledge: fetchKnowledge,
    saveKnowledge,
    setKnowledgeError: setError,
  };
}
