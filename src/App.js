import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  Trash2,
  HelpCircle,
  PieChart,
  Calendar,
  BarChart2,
  Clipboard,
  CheckCircle
} from 'lucide-react';

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================

const CARDS = {
  AIRTEL: "Airtel Axis",
  FLIPKART: "Flipkart Axis"
};

// *** UPDATE THIS WITH YOUR ACTUAL LAST 4 DIGITS ***
const CARD_MAPPING = {
  "8316": CARDS.AIRTEL,    
  "5214": CARDS.FLIPKART   
};

const CATEGORIES = {
  AIRTEL: [
    { id: "airtel_svcs", name: "Airtel Services (App)", rate: 0.25, cap: 250 },
    { id: "utilities", name: "Utilities (Airtel App)", rate: 0.10, cap: 250 },
    { id: "preferred", name: "Preferred (Zomato/Swiggy/BB)", rate: 0.10, cap: 500 },
    { id: "other", name: "Other Spends", rate: 0.01, cap: Infinity }
  ],
  FLIPKART: [
    { id: "myntra", name: "Myntra", rate: 0.075, cap: 4000, type: "quarterly" },
    { id: "flipkart", name: "Flipkart", rate: 0.05, cap: 4000, type: "quarterly" },
    { id: "cleartrip", name: "Cleartrip", rate: 0.05, cap: 4000, type: "quarterly" },
    { id: "preferred_fk", name: "Preferred (Swiggy/Uber/PVR)", rate: 0.04, cap: Infinity, type: "monthly" },
    { id: "other", name: "Other Spends", rate: 0.01, cap: Infinity, type: "monthly" }
  ]
};

// ==========================================
// 2. UTILITY FUNCTIONS (LOGIC)
// ==========================================

const getCycleDates = (dateObj = new Date()) => {
  const currentDay = dateObj.getDate();
  const currentMonth = dateObj.getMonth();
  const currentYear = dateObj.getFullYear();

  let start, end;
  // Statement date 12th -> Cycle: 13th Prev to 12th Curr
  if (currentDay <= 12) {
    end = new Date(currentYear, currentMonth, 12);
    start = new Date(currentYear, currentMonth - 1, 13);
  } else {
    start = new Date(currentYear, currentMonth, 13);
    end = new Date(currentYear, currentMonth + 1, 12);
  }
  return { start, end };
};

const getQuarterDates = (dateObj = new Date()) => {
  const currentYear = dateObj.getFullYear();
  const q1 = new Date(currentYear, 2, 13); 
  const q2 = new Date(currentYear, 5, 13); 
  const q3 = new Date(currentYear, 8, 13); 
  const q4 = new Date(currentYear, 11, 13); 

  if (dateObj < q1) return { start: new Date(currentYear - 1, 11, 13), end: new Date(currentYear, 2, 12), label: "Q4 (Prev)" };
  else if (dateObj >= q1 && dateObj < q2) return { start: q1, end: new Date(currentYear, 5, 12), label: "Q1" };
  else if (dateObj >= q2 && dateObj < q3) return { start: q2, end: new Date(currentYear, 8, 12), label: "Q2" };
  else if (dateObj >= q3 && dateObj < q4) return { start: q3, end: new Date(currentYear, 11, 12), label: "Q3" };
  else return { start: q4, end: new Date(currentYear + 1, 2, 12), label: "Q4" };
};

const isBetween = (dateStr, start, end) => {
  const d = new Date(dateStr);
  d.setHours(0,0,0,0);
  const s = new Date(start); s.setHours(0,0,0,0);
  const e = new Date(end); e.setHours(23,59,59,999);
  return d >= s && d <= e;
};

// Axis Bank SMS Parser
const parseSMS = (text) => {
  const result = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  
  // 1. Amount
  const amtMatch = text.match(/Spent\s+(?:INR|Rs\.?)\s*([\d,]+(?:\.\d{2})?)/i);
  if (amtMatch) result.amount = amtMatch[1].replace(/,/g, '');

  // 2. Card Last 4
  const cardMatch = text.match(/Card\s+no\.\s+XX(\d{4})/i);
  if (cardMatch) result.last4 = cardMatch[1];

  // 3. Date
  const dateMatch = text.match(/(\d{2}-\d{2}-\d{2})/);
  if (dateMatch) {
    const parts = dateMatch[1].split('-'); 
    if(parts.length === 3) result.date = `20${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // 4. Merchant (Line after Date)
  const dateLineIndex = lines.findIndex(line => /\d{2}-\d{2}-\d{2}/.test(line));
  if (dateLineIndex !== -1 && lines[dateLineIndex + 1]) {
    result.merchant = lines[dateLineIndex + 1];
  } else {
    // Fallback regex
    const mMatch = text.match(/(?:at|to|via)\s+([A-Za-z0-9\s&*]+?)(?:\s+(?:on|using|with|txn)|$)/i);
    if(mMatch) result.merchant = mMatch[1];
  }

  return result;
};

// Merchant Categorizer
const guessCategory = (merchant, card) => {
  const m = merchant.toLowerCase();
  if (card === CARDS.AIRTEL) {
    if (m.includes('swiggy') || m.includes('zomato') || m.includes('bigbasket') || m.includes('blinkit')) return 'preferred';
    if (m.includes('airtel')) return 'airtel_svcs';
    if (m.includes('power') || m.includes('bescom') || m.includes('gas') || m.includes('water') || m.includes('bill')) return 'utilities';
    return 'other';
  } else {
    if (m.includes('myntra')) return 'myntra';
    if (m.includes('flipkart')) return 'flipkart';
    if (m.includes('cleartrip')) return 'cleartrip';
    if (m.includes('swiggy') || m.includes('uber') || m.includes('pvr') || m.includes('cult')) return 'preferred_fk';
    return 'other';
  }
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================

export default function App() {
  const [activeTab, setActiveTab] = useState('tracker');
  const [transactions, setTransactions] = useState(() => {
    const saved = localStorage.getItem('transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [stats, setStats] = useState({ 
    airtel: {}, 
    flipkart: {}, 
    summary: { airtel: {}, flipkart: {} } 
  });

  // Form & UI State
  const [form, setForm] = useState({ card: CARDS.AIRTEL, category: CATEGORIES.AIRTEL[0].id, amount: '', date: new Date().toISOString().split('T')[0] });
  const [smsInput, setSmsInput] = useState('');
  
  // Recommender State
  const [recAmount, setRecAmount] = useState(500);
  const [recMerchant, setRecMerchant] = useState('swiggy');

  useEffect(() => {
    localStorage.setItem('transactions', JSON.stringify(transactions));
    calculateStats();
  }, [transactions]);

  // --- CALCULATION ENGINE ---
  const calculateStats = () => {
    const cycle = getCycleDates();
    const quarter = getQuarterDates();

    // 1. Init Containers
    const airtelCalc = {}; 
    CATEGORIES.AIRTEL.forEach(c => airtelCalc[c.id] = { ...c, spend: 0, cashback: 0 });

    const flipkartCalc = {};
    CATEGORIES.FLIPKART.forEach(c => flipkartCalc[c.id] = { ...c, spend: 0, cashback: 0 });

    const summary = {
      airtel: { totalSpend: 0, totalCashback: 0 },
      flipkart: { quarterSpend: 0, quarterCashback: 0, monthSpend: 0, monthCashback: 0 }
    };

    // 2. Process Transactions
    transactions.forEach(txn => {
      const amt = parseFloat(txn.amount);
      const tDate = txn.date;
      
      // Airtel (Monthly)
      if (txn.card === CARDS.AIRTEL) {
        if (isBetween(tDate, cycle.start, cycle.end)) {
          if(airtelCalc[txn.category]) airtelCalc[txn.category].spend += amt;
        }
      } 
      // Flipkart (Hybrid)
      else if (txn.card === CARDS.FLIPKART) {
        // A. Quarterly Tracker Logic
        if (["myntra", "flipkart", "cleartrip"].includes(txn.category)) {
          if (isBetween(tDate, quarter.start, quarter.end)) {
             flipkartCalc[txn.category].spend += amt;
             summary.flipkart.quarterSpend += amt; // Track Q Spend for Dashboard
          }
        } else {
          // Unlimited/Monthly cats -> Track by Cycle
          if (isBetween(tDate, cycle.start, cycle.end)) {
            flipkartCalc[txn.category].spend += amt;
          }
        }
        
        // B. Monthly Summary Logic (Everything in current bill)
        if (isBetween(tDate, cycle.start, cycle.end)) {
          summary.flipkart.monthSpend += amt;
        }
      }
    });

    // 3. Apply Caps for "Tracker" View
    // Airtel
    Object.keys(airtelCalc).forEach(k => {
      const item = airtelCalc[k];
      item.cashback = Math.min(item.spend * item.rate, item.cap);
      summary.airtel.totalSpend += item.spend;
      summary.airtel.totalCashback += item.cashback;
    });
    // Flipkart
    Object.keys(flipkartCalc).forEach(k => {
      const item = flipkartCalc[k];
      item.cashback = Math.min(item.spend * item.rate, item.cap);
    });

    // 4. Calculate Flipkart Monthly Cashback (The "Statement" Request)
    // We calculate this month's cashback respecting Quarterly remaining caps
    let fkMonthCashback = 0;
    CATEGORIES.FLIPKART.forEach(cat => {
      const thisMonthSpend = transactions
          .filter(t => t.card === CARDS.FLIPKART && t.category === cat.id && isBetween(t.date, cycle.start, cycle.end))
          .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      if (thisMonthSpend > 0) {
        if (["myntra", "flipkart", "cleartrip"].includes(cat.id)) {
          // Quarterly Capped: Check Remaining Cap in the Quarter
          // Note: flipkartCalc[cat.id].cashback contains TOTAL Q cashback earned so far
          // We need to approximate if this month's spend pushed it over limit? 
          // Simplified: We calculate potential based on Q limit remaining.
          const totalQSpend = flipkartCalc[cat.id].spend;
          const cap = cat.cap;
          const rate = cat.rate;
          
          // How much cap was used by previous months in this quarter?
          // (Total Q Spend - This Month Spend) * Rate
          const prevMonthsSpend = Math.max(0, totalQSpend - thisMonthSpend);
          const prevMonthsCashback = Math.min(prevMonthsSpend * rate, cap);
          
          const remainingCap = cap - prevMonthsCashback;
          
          if (remainingCap > 0) {
             const earned = Math.min(thisMonthSpend * rate, remainingCap);
             fkMonthCashback += earned;
          }
        } else {
          // Uncapped: Simple
          fkMonthCashback += (thisMonthSpend * cat.rate);
        }
      }
    });
    summary.flipkart.monthCashback = fkMonthCashback;

    setStats({ airtel: airtelCalc, flipkart: flipkartCalc, summary });
  };

  // --- ACTIONS ---
  const handleSMSPaste = (e) => {
    const text = e.target.value;
    setSmsInput(text);
    const parsed = parseSMS(text);
    if (parsed.amount) {
      let detectedCard = form.card;
      // Auto-detect using Last 4 Digits Config
      if (parsed.last4 && CARD_MAPPING[parsed.last4]) {
        detectedCard = CARD_MAPPING[parsed.last4];
      } else {
        if (text.toLowerCase().includes('airtel')) detectedCard = CARDS.AIRTEL;
        else if (text.toLowerCase().includes('flipkart')) detectedCard = CARDS.FLIPKART;
      }
      const merchant = parsed.merchant || "Unknown";
      const detectedCat = guessCategory(merchant, detectedCard);
      setForm({
        ...form,
        amount: parsed.amount,
        date: parsed.date || new Date().toISOString().split('T')[0],
        card: detectedCard,
        category: detectedCat
      });
    }
  };

  const handleAddTransaction = (e) => {
    e.preventDefault();
    const newTxn = { ...form, id: Date.now() };
    setTransactions([...transactions, newTxn]);
    setForm({ ...form, amount: '', category: CATEGORIES.AIRTEL[0].id });
    setSmsInput('');
  };
  
  const deleteTransaction = (id) => {
    setTransactions(transactions.filter(t => t.id !== id));
  };

  // --- HISTORICAL DATA ---
  const historicalData = useMemo(() => {
    const buckets = {};
    const sortedTxns = [...transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
    sortedTxns.forEach(txn => {
      const d = new Date(txn.date);
      let cycleKey = d.getDate() <= 12 
        ? `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}` 
        : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

      if (!buckets[cycleKey]) buckets[cycleKey] = { id: cycleKey, label: new Date(cycleKey.split('-')[0], cycleKey.split('-')[1]).toLocaleString('default', {month:'short', year:'2-digit'}), cashback: 0 };
      
      // Simple cashback approximation for history (ignoring complex past quarterly state reconstruction)
      const rate = (txn.card === CARDS.AIRTEL 
        ? CATEGORIES.AIRTEL.find(c => c.id === txn.category)?.rate 
        : CATEGORIES.FLIPKART.find(c => c.id === txn.category)?.rate) || 0.01;
      buckets[cycleKey].cashback += (parseFloat(txn.amount) * rate);
    });
    const bucketArray = Object.values(buckets).sort((a,b) => a.id.localeCompare(b.id));
    return { chartData: bucketArray.slice(-6), totalLifetime: bucketArray.reduce((acc, b) => acc + b.cashback, 0) };
  }, [transactions]);

  // --- RECOMMENDATION ---
  const getRecommendation = () => {
    let airtelRate = 0.01; let airtelCapRem = Infinity;
    let aCatId = "other";
    if (["swiggy", "zomato", "bigbasket", "blinkit"].includes(recMerchant)) aCatId = "preferred";
    else if (recMerchant === "airtel_bill") aCatId = "airtel_svcs";
    else if (recMerchant === "utility") aCatId = "utilities";
    
    if (stats.airtel[aCatId]) {
      airtelCapRem = stats.airtel[aCatId].cap - stats.airtel[aCatId].cashback;
      const baseRate = stats.airtel[aCatId].rate;
      if (airtelCapRem <= 0) airtelRate = 0.01; 
      else {
        const potentialCB = recAmount * baseRate;
        if (potentialCB <= airtelCapRem) airtelRate = baseRate;
        else {
          const amountAtHighRate = airtelCapRem / baseRate;
          const amountAtLowRate = recAmount - amountAtHighRate;
          airtelRate = (airtelCapRem + (amountAtLowRate * 0.01)) / recAmount;
        }
      }
    }

    let flipkartRate = 0.01; let fCatId = "other";
    if (["swiggy", "uber", "pvr", "cult"].includes(recMerchant)) fCatId = "preferred_fk";
    else if (recMerchant === "myntra") fCatId = "myntra";
    else if (recMerchant === "flipkart") fCatId = "flipkart";
    if (recMerchant === "zomato") fCatId = "other"; 

    if (stats.flipkart[fCatId]) {
      const fCapRem = stats.flipkart[fCatId].cap - stats.flipkart[fCatId].cashback;
      const fBaseRate = stats.flipkart[fCatId].rate;
      if (fCapRem <= 0) flipkartRate = 0.01;
      else {
        const fPotential = recAmount * fBaseRate;
        if (fPotential <= fCapRem) flipkartRate = fBaseRate;
        else {
           const fHighAmt = fCapRem / fBaseRate;
           const fLowAmt = recAmount - fHighAmt;
           flipkartRate = (fCapRem + (fLowAmt * 0.01)) / recAmount;
        }
      }
    }
    const aEarn = recAmount * airtelRate;
    const fEarn = recAmount * flipkartRate;
    return { aEarn, fEarn, winner: aEarn >= fEarn ? 'Airtel Axis' : 'Flipkart Axis' };
  };

  const recResult = getRecommendation();
  const cycle = getCycleDates();
  const quarter = getQuarterDates();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 font-sans">
      
      {/* HEADER */}
      <div className="bg-blue-800 text-white p-4 shadow-lg sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> CC Tracker
          </h1>
          <div className="text-xs text-blue-100 text-right">
             <p className="opacity-80">Bill Cycle</p>
            <p className="font-mono">{cycle.start.getDate()} {cycle.start.toLocaleString('default', {month:'short'})} - {cycle.end.getDate()} {cycle.end.toLocaleString('default', {month:'short'})}</p>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="max-w-lg mx-auto px-4 mt-6">
        <div className="grid grid-cols-5 bg-white rounded-lg shadow mb-6 overflow-hidden">
          <button onClick={() => setActiveTab('tracker')} className={`py-3 text-[10px] font-bold uppercase flex flex-col items-center gap-1 ${activeTab === 'tracker' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <TrendingUp size={16} /> Limits
          </button>
          <button onClick={() => setActiveTab('statements')} className={`py-3 text-[10px] font-bold uppercase flex flex-col items-center gap-1 ${activeTab === 'statements' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <PieChart size={16} /> Bill
          </button>
          <button onClick={() => setActiveTab('add')} className={`py-3 text-[10px] font-bold uppercase flex flex-col items-center gap-1 ${activeTab === 'add' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <PlusCircle size={16} /> Add
          </button>
          <button onClick={() => setActiveTab('rec')} className={`py-3 text-[10px] font-bold uppercase flex flex-col items-center gap-1 ${activeTab === 'rec' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <HelpCircle size={16} /> Best
          </button>
          <button onClick={() => setActiveTab('stats')} className={`py-3 text-[10px] font-bold uppercase flex flex-col items-center gap-1 ${activeTab === 'stats' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <BarChart2 size={16} /> Stats
          </button>
        </div>

        {/* --- VIEW 1: LIMIT TRACKER --- */}
        {activeTab === 'tracker' && (
           <div className="space-y-6">
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="bg-red-50 p-3 border-b border-red-100 flex justify-between items-center"><h2 className="font-bold text-red-800 text-sm">Airtel Axis</h2> <span className="text-[10px] bg-red-200 text-red-800 px-2 rounded">Monthly Cap</span></div>
               <div className="p-4 space-y-4">
                 {Object.values(stats.airtel).map((cat) => (
                   <div key={cat.name}>
                     <div className="flex justify-between text-xs mb-1 font-medium text-gray-700"><span>{cat.name}</span><span>₹{cat.cashback.toFixed(0)} / {cat.cap === Infinity ? '∞' : cat.cap}</span></div>
                     {cat.cap !== Infinity && <div className="w-full bg-gray-100 rounded-full h-2"><div className={`h-2 rounded-full ${cat.cashback >= cat.cap ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min((cat.cashback / cat.cap) * 100, 100)}%` }}></div></div>}
                   </div>
                 ))}
               </div>
             </div>
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="bg-indigo-50 p-3 border-b border-indigo-100 flex justify-between items-center"><h2 className="font-bold text-indigo-800 text-sm">Flipkart Axis</h2> <span className="text-[10px] bg-indigo-200 text-indigo-800 px-2 rounded">Quarterly Cap</span></div>
               <div className="p-4 space-y-4">
                 {Object.values(stats.flipkart).filter(c => c.type === "quarterly").map((cat) => (
                   <div key={cat.name}>
                     <div className="flex justify-between text-xs mb-1 font-medium text-gray-700"><span>{cat.name}</span><span>₹{cat.cashback.toFixed(0)} / {cat.cap}</span></div>
                     <div className="w-full bg-gray-100 rounded-full h-2"><div className={`h-2 rounded-full ${cat.cashback >= cat.cap ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((cat.cashback / cat.cap) * 100, 100)}%` }}></div></div>
                     <p className="text-[10px] text-gray-400 mt-1 text-right">Qtr Spend: ₹{cat.spend}</p>
                   </div>
                 ))}
               </div>
             </div>
           </div>
        )}

        {/* --- VIEW 2: STATEMENTS (Bill) --- */}
        {activeTab === 'statements' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-xl shadow-lg text-white p-5">
               <h2 className="font-bold text-sm mb-4 border-b border-white/20 pb-2 flex items-center gap-2"><Calendar size={14}/> Airtel Bill Estimate</h2>
               <div className="grid grid-cols-2 gap-4">
                 <div><p className="text-xs text-red-100 uppercase">Spend (Mo)</p><p className="text-2xl font-bold">₹{stats.summary.airtel.totalSpend.toLocaleString()}</p></div>
                 <div className="text-right"><p className="text-xs text-red-100 uppercase">Cashback (Mo)</p><p className="text-2xl font-bold text-yellow-300">+₹{stats.summary.airtel.totalCashback.toFixed(2)}</p></div>
               </div>
            </div>

            <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
               <div className="bg-indigo-600 text-white p-3"><h2 className="font-bold text-sm flex items-center gap-2"><PieChart size={14}/> Flipkart Axis Report</h2></div>
               <div className="p-4 border-b border-gray-100 bg-gray-50">
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-1">Quarterly Spend ({quarter.label})</h3>
                 <p className="text-2xl font-bold text-gray-800">₹{stats.summary.flipkart.quarterSpend.toLocaleString()}</p>
                 <p className="text-[10px] text-gray-400">Total spend on Myntra/Flipkart/Cleartrip this quarter</p>
               </div>
               <div className="p-4 grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-1">Current Bill Spend</h3>
                    <p className="text-xl font-bold text-gray-800">₹{stats.summary.flipkart.monthSpend.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-1">Current Bill Cashback</h3>
                    <p className="text-xl font-bold text-green-600">+₹{stats.summary.flipkart.monthCashback.toFixed(2)}</p>
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* --- VIEW 3: ADD TRANSACTION --- */}
        {activeTab === 'add' && (
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
            {/* SMS PASTE */}
            <div className="mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
               <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2"><Clipboard size={14} /> SMS Auto-Parser</label>
               <textarea rows="3" placeholder="Paste Axis SMS here..." className="w-full text-xs p-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none" value={smsInput} onChange={handleSMSPaste}></textarea>
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm({...form, card: CARDS.AIRTEL, category: CATEGORIES.AIRTEL[0].id})} className={`p-3 rounded-lg border text-xs font-bold transition ${form.card === CARDS.AIRTEL ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 text-gray-600'}`}>Airtel Axis</button>
                <button type="button" onClick={() => setForm({...form, card: CARDS.FLIPKART, category: CATEGORIES.FLIPKART[0].id})} className={`p-3 rounded-lg border text-xs font-bold transition ${form.card === CARDS.FLIPKART ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-gray-200 text-gray-600'}`}>Flipkart Axis</button>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                <select className="w-full p-3 border border-gray-300 rounded-lg bg-white text-sm" value={form.category} onChange={(e) => setForm({...form, category: e.target.value})}>
                  {(form.card === CARDS.AIRTEL ? CATEGORIES.AIRTEL : CATEGORIES.FLIPKART).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label><input type="date" className="w-full p-3 border border-gray-300 rounded-lg text-sm" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount</label><input type="number" min="1" placeholder="₹" className="w-full p-3 border border-gray-300 rounded-lg text-sm" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})}/></div>
              </div>

              {/* DYNAMIC PREVIEW */}
              {form.amount && (
                (() => {
                  const currentStats = form.card === CARDS.AIRTEL ? stats.airtel[form.category] : stats.flipkart[form.category];
                  const remainingCap = currentStats.cap - currentStats.cashback;
                  const rawEarn = parseFloat(form.amount) * currentStats.rate;
                  let finalEarn = 0;
                  let isCapped = false;
                  if (currentStats.cap === Infinity) finalEarn = rawEarn;
                  else {
                    if (remainingCap <= 0) { finalEarn = 0; isCapped = true; }
                    else { finalEarn = Math.min(rawEarn, remainingCap); if (rawEarn > remainingCap) isCapped = true; }
                  }
                  return (
                    <div className={`rounded-lg p-3 flex justify-between items-center ${isCapped ? 'bg-orange-50 border border-orange-200 text-orange-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                       <div className="flex items-center gap-2"><TrendingUp size={16} /><span className="text-xs font-bold uppercase">Estimated CB</span></div>
                       <div className="text-right"><span className="block font-bold text-lg">+₹{finalEarn.toFixed(2)}</span>{isCapped && <span className="text-[10px] uppercase font-bold text-orange-600">Cap Hit</span>}</div>
                    </div>
                  )
                })()
              )}

              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-200"><PlusCircle size={20} /> Add</button>
            </form>
          </div>
        )}

        {/* --- VIEW 4: RECOMMENDER --- */}
        {activeTab === 'rec' && (
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
             <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><HelpCircle className="text-blue-500"/> Best Card Checker</h2>
             <div className="space-y-4 mb-6">
               <div>
                 <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Merchant</label>
                 <select className="w-full p-3 border border-gray-300 rounded-lg bg-white" value={recMerchant} onChange={(e) => setRecMerchant(e.target.value)}>
                   <option value="swiggy">Swiggy (Food)</option><option value="zomato">Zomato (Food)</option><option value="bigbasket">BigBasket (Grocery)</option><option value="airtel_bill">Airtel Bill Payment</option><option value="utility">Electricity/Water/Gas</option><option value="flipkart">Flipkart</option><option value="myntra">Myntra</option><option value="uber">Uber</option><option value="other">Other / Offline</option>
                 </select>
               </div>
               <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount</label><input type="number" className="w-full p-3 border border-gray-300 rounded-lg" value={recAmount} onChange={(e) => setRecAmount(e.target.value)}/></div>
             </div>
             <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-5 rounded-xl border border-gray-200 text-center">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">You should use</p>
                <h3 className={`text-2xl font-bold ${recResult.winner.includes('Airtel') ? 'text-red-600' : 'text-indigo-600'}`}>{recResult.winner}</h3>
                <div className="mt-6 flex gap-3 text-sm">
                  <div className={`flex-1 p-3 rounded-lg border ${recResult.winner.includes('Airtel') ? 'bg-white border-red-200 shadow-sm' : 'bg-transparent border-transparent opacity-60'}`}><span className="block text-gray-500 text-xs mb-1">Airtel Axis</span><span className="font-bold text-lg">₹{recResult.aEarn.toFixed(0)}</span></div>
                  <div className={`flex-1 p-3 rounded-lg border ${recResult.winner.includes('Flipkart') ? 'bg-white border-indigo-200 shadow-sm' : 'bg-transparent border-transparent opacity-60'}`}><span className="block text-gray-500 text-xs mb-1">Flipkart Axis</span><span className="font-bold text-lg">₹{recResult.fEarn.toFixed(0)}</span></div>
                </div>
             </div>
          </div>
        )}

        {/* --- VIEW 5: STATS DASHBOARD --- */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="bg-slate-800 text-white rounded-xl p-6 shadow-xl text-center">
               <p className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-2">Total Lifetime Savings</p>
               <h2 className="text-4xl font-extrabold text-green-400">₹{historicalData.totalLifetime.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</h2>
            </div>
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4">
              <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><BarChart2 size={16}/> Monthly Trend</h3>
              <div className="flex items-end justify-between h-40 gap-2 mt-4">
                {historicalData.chartData.length === 0 ? <p className="text-sm text-gray-400 w-full text-center self-center">No data yet</p> : 
                  historicalData.chartData.map((d) => (
                    <div key={d.id} className="flex flex-col items-center gap-1 w-full group relative">
                      <div className="absolute -top-8 bg-gray-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition">₹{d.cashback.toFixed(0)}</div>
                      <div className="w-full max-w-[30px] bg-blue-500 rounded-t-md hover:bg-blue-600 transition-all" style={{ height: `${Math.max((d.cashback / 500) * 100, 10)}%` }}></div>
                      <span className="text-[10px] text-gray-500 font-medium">{d.label}</span>
                    </div>
                  ))
                }
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-3 px-1"><h3 className="font-bold text-gray-800 text-sm">History</h3><button onClick={() => {if(window.confirm('Delete all data?')) {setTransactions([]);}}} className="text-xs text-red-400">Clear All</button></div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 divide-y">
                {transactions.sort((a,b) => new Date(b.date) - new Date(a.date)).map(txn => (
                  <div key={txn.id} className="p-3 flex justify-between items-center group">
                    <div>
                      <p className="font-medium text-xs text-gray-800">{txn.card === CARDS.AIRTEL ? 'Airtel' : 'Flipkart'}</p>
                      <p className="text-[10px] text-gray-500">{new Date(txn.date).toLocaleDateString()} • {txn.category}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-700 text-sm">₹{txn.amount}</span>
                      <button onClick={() => deleteTransaction(txn.id)} className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}