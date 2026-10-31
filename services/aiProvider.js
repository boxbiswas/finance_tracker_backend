import OpenAI from 'openai';

// Configurable AI Provider Service supporting Gemini, OpenAI, and a database-grounded local fallback
export const generateAIResponse = async ({ systemPrompt, userMessage, context = {} }) => {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // 1. Google Gemini API Provider
  if ((provider === 'gemini' && geminiKey) || (!openaiKey && geminiKey)) {
    try {
      const model = process.env.AI_MODEL || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      const payload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${userMessage}\n\n[Financial Context Data]:\n${JSON.stringify(context, null, 2)}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn('Gemini API call failed, falling back to verified context generator:', errorBody);
        return generateGroundedFallback(userMessage, context);
      }

      const json = await response.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        return sanitizeAIResponse(rawText);
      }
    } catch (err) {
      console.warn('Gemini call error, falling back to verified context generator:', err.message);
      return generateGroundedFallback(userMessage, context);
    }
  }

  // 2. OpenAI API Provider
  if ((provider === 'openai' && openaiKey) || openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const model = process.env.AI_MODEL || 'gpt-4o-mini';

      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${userMessage}\n\n[Financial Context Data]:\n${JSON.stringify(context, null, 2)}`
          }
        ]
      });

      const rawText = completion.choices?.[0]?.message?.content;
      if (rawText) {
        return sanitizeAIResponse(rawText);
      }
    } catch (err) {
      console.warn('OpenAI call error, falling back to verified context generator:', err.message);
      return generateGroundedFallback(userMessage, context);
    }
  }

  // 3. Fallback: Rule-governed natural language synthesis grounded in MongoDB data
  return generateGroundedFallback(userMessage, context);
};

// Sanitizes AI output enforcing Clarivo terminology and WCAG guidelines per DESIGN.md
export const sanitizeAIResponse = (text) => {
  if (!text) return '';

  let sanitized = text
    // Rule: Replace 'bank balance' with 'recorded balance' or 'net cash flow'
    .replace(/bank\s+balance/gi, 'recorded balance')
    .replace(/actual\s+balance/gi, 'recorded balance')
    // Remove unwanted script tags or raw HTML
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim();

  return sanitized;
};

// Grounded fallback engine synthesizing verified answers strictly from database context
const generateGroundedFallback = (question, context) => {
  const q = (question || '').toLowerCase();
  const summary = context?.summary || context?.currentMonth;
  const breakdown = context?.breakdown || context?.spendingConcentration;
  const budgets = context?.budgets || context?.budgetAdherence;

  // Spending / Expense inquiry
  if (q.includes('spend') || q.includes('spent') || q.includes('how much did i spend')) {
    const expense = summary?.totalExpense ?? summary?.expense ?? 0;
    const income = summary?.totalIncome ?? summary?.income ?? 0;
    const netFlow = summary?.netCashFlow ?? (income - expense);
    return `You recorded ₹${expense.toLocaleString('en-IN')} in total expenses for this period against ₹${income.toLocaleString('en-IN')} in income. Your net cash flow (recorded balance) is ₹${netFlow.toLocaleString('en-IN')}.`;
  }

  // Highest expense category inquiry
  if (q.includes('highest') || q.includes('which category') || q.includes('category accounted')) {
    const top = breakdown?.topCategory;
    if (top) {
      const catName = top.category.replace(/_/g, ' ');
      return `The category that accounted for your highest expense was ${catName}, totaling ₹${top.amount.toLocaleString('en-IN')} (${top.percentage}% of all recorded spending).`;
    }
    return "No category expenses have been recorded for this timeframe yet.";
  }

  // Budget status inquiry
  if (q.includes('budget') || q.includes('exceeding') || q.includes('over limit')) {
    const exceeded = budgets?.exceededBudgets || (budgets?.budgets?.filter((b) => b.isOverBudget) || []);
    if (exceeded.length > 0) {
      const names = exceeded.map((b) => `${b.category.replace(/_/g, ' ')} (over by ₹${b.overBy})`).join(', ');
      return `You are currently exceeding ${exceeded.length} category budget(s): ${names}.`;
    }
    const totalSpent = budgets?.totalSpent || 0;
    const totalBudget = budgets?.totalBudgeted || budgets?.totalLimit || 0;
    return `You are not exceeding any budgets. You have spent ₹${totalSpent.toLocaleString('en-IN')} out of your ₹${totalBudget.toLocaleString('en-IN')} total monthly budget limit.`;
  }

  // Month comparison inquiry
  if (q.includes('compare') || q.includes('last month') || q.includes('previous')) {
    const mom = context?.monthOverMonth || context?.comparison;
    if (mom) {
      const delta = mom.expenseDelta || 0;
      const pct = Math.abs(mom.expenseChangePercent || 0);
      const direction = delta >= 0 ? 'more' : 'less';
      return `Comparing this month with last month, your recorded spending is ₹${Math.abs(delta).toLocaleString('en-IN')} ${direction} (${pct}% change).`;
    }
    return "Comparing your spending requires transactions across consecutive months. Ensure earlier records exist in your ledger.";
  }

  // Difference between income and expenses
  if (q.includes('difference') || q.includes('net cash flow')) {
    const income = summary?.totalIncome ?? summary?.income ?? 0;
    const expense = summary?.totalExpense ?? summary?.expense ?? 0;
    const net = summary?.netCashFlow ?? (income - expense);
    return `The difference between your recorded income (₹${income.toLocaleString('en-IN')}) and expenses (₹${expense.toLocaleString('en-IN')}) is a net cash flow of ₹${net.toLocaleString('en-IN')}.`;
  }

  // Chart inquiry
  if (q.includes('chart') || q.includes('visual')) {
    const chart = context?.chartData || context;
    if (chart?.insights?.summary) {
      return chart.insights.summary;
    }
    return "Your financial charts show monthly income and expense comparison, category spending shares, and net cash flow trajectory derived directly from your database.";
  }

  // Largest expenses inquiry
  if (q.includes('largest') || q.includes('biggest')) {
    const txns = context?.transactions || [];
    if (txns.length > 0) {
      const topTxn = txns[0];
      return `Your largest recorded expense is ₹${topTxn.amount.toLocaleString('en-IN')} for ${topTxn.category.replace(/_/g, ' ')}${topTxn.notes ? ` (${topTxn.notes})` : ''}.`;
    }
    return "No individual transactions matched the query criteria.";
  }

  // General grounded summary
  const inc = summary?.totalIncome ?? summary?.income ?? 0;
  const exp = summary?.totalExpense ?? summary?.expense ?? 0;
  const net = summary?.netCashFlow ?? (inc - exp);
  return `Based on your database records, your recorded income is ₹${inc.toLocaleString('en-IN')}, expenses are ₹${exp.toLocaleString('en-IN')}, and net cash flow is ₹${net.toLocaleString('en-IN')}.`;
};

export default {
  generateAIResponse,
  sanitizeAIResponse
};

