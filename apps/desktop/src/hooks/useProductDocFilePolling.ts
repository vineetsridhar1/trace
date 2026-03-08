import { useEffect, useMemo, useRef, useState } from 'react';

interface ProductDocFilePollingResult {
  prdContent: string;
  techContent: string;
  ticketsContent: string;
  hasPrd: boolean;
  hasTech: boolean;
  hasTickets: boolean;
  parsedTickets: Array<{ id: string; title?: string; body: string; dependencies: string[] }>;
}

export function useProductDocFilePolling(worktreePath: string | null): ProductDocFilePollingResult {
  const [prdContent, setPrdContent] = useState('');
  const [techContent, setTechContent] = useState('');
  const [ticketsContent, setTicketsContent] = useState('');

  const prevContentRef = useRef({ prd: '', tech: '', tickets: '' });

  useEffect(() => {
    if (!worktreePath) return;
    prevContentRef.current = { prd: '', tech: '', tickets: '' };

    const poll = async () => {
      const basePath = `${worktreePath}/.trace`;
      const [prdResult, techResult, ticketsResult] = await Promise.allSettled([
        window.traceAPI.readProductDocFile(`${basePath}/product-scoping.md`),
        window.traceAPI.readProductDocFile(`${basePath}/technical-scoping.md`),
        window.traceAPI.readProductDocFile(`${basePath}/tickets.json`),
      ]);

      if (prdResult.status === 'fulfilled' && prdResult.value.success && prdResult.value.content) {
        if (prdResult.value.content !== prevContentRef.current.prd) {
          prevContentRef.current.prd = prdResult.value.content;
          setPrdContent(prdResult.value.content);
        }
      } else if (prdResult.status === 'fulfilled' && !prdResult.value.success) {
        if (prevContentRef.current.prd !== '') {
          prevContentRef.current.prd = '';
          setPrdContent('');
        }
      }
      if (techResult.status === 'fulfilled' && techResult.value.success && techResult.value.content) {
        if (techResult.value.content !== prevContentRef.current.tech) {
          prevContentRef.current.tech = techResult.value.content;
          setTechContent(techResult.value.content);
        }
      } else if (techResult.status === 'fulfilled' && !techResult.value.success) {
        if (prevContentRef.current.tech !== '') {
          prevContentRef.current.tech = '';
          setTechContent('');
        }
      }
      if (ticketsResult.status === 'fulfilled' && ticketsResult.value.success && ticketsResult.value.content) {
        if (ticketsResult.value.content !== prevContentRef.current.tickets) {
          prevContentRef.current.tickets = ticketsResult.value.content;
          try {
            setTicketsContent(JSON.stringify(JSON.parse(ticketsResult.value.content), null, 2));
          } catch {
            setTicketsContent(ticketsResult.value.content);
          }
        }
      } else if (ticketsResult.status === 'fulfilled' && !ticketsResult.value.success) {
        if (prevContentRef.current.tickets !== '') {
          prevContentRef.current.tickets = '';
          setTicketsContent('');
        }
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 5000);
    return () => clearInterval(interval);
  }, [worktreePath]);

  const parsedTickets = useMemo(() => {
    if (!ticketsContent.trim()) return [];
    try {
      const parsed = JSON.parse(ticketsContent);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }, [ticketsContent]);

  const hasPrd = prdContent.trim().length > 0;
  const hasTech = techContent.trim().length > 0;
  const hasTickets = ticketsContent.trim().length > 0;

  return useMemo(() => ({
    prdContent,
    techContent,
    ticketsContent,
    hasPrd,
    hasTech,
    hasTickets,
    parsedTickets,
  }), [prdContent, techContent, ticketsContent, hasPrd, hasTech, hasTickets, parsedTickets]);
}
