/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, ComposedChart, PieChart as RePieChart, Pie, Cell
} from 'recharts';
import { 
  Plus, TrendingUp, TrendingDown, Users, FileText, Calendar, 
  DollarSign, PieChart, Menu, X, ChevronRight, LogIn, LogOut,
  ArrowUpRight, ArrowDownRight, Activity, Download, Settings,
  CheckCircle, Share2, Camera, Image as ImageIcon
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfYear, subMonths, addMonths, setYear, getYear, getMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, signIn, logOut } from './lib/firebase';
import { toPng } from 'html-to-image';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, query, where, onSnapshot, addDoc, getDocs, 
  orderBy, Timestamp, doc, deleteDoc, getCountFromServer,
  setDoc, serverTimestamp, getDoc
} from 'firebase/firestore';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const DEFAULT_WORKER_SHARE = 1.0;

// --- Utils ---
const formatThaiBE = (date: Date | string, formatStr: string) => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const beYear = getYear(d) + 543;
  const beYearShort = beYear % 100;
  
  return format(d, formatStr, { locale: th })
    .replace(getYear(d).toString(), beYear.toString())
    .replace(format(d, 'yy'), beYearShort.toString().padStart(2, '0'));
};

const formatMoney = (val: number) => {
  return val.toLocaleString('th-TH', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

const formatWeight = (val: number) => {
  return Math.round(val).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

// --- Types ---
interface Worker {
  id?: string;
  name: string;
  createdBy: string;
}

interface UserSettings {
  id?: string;
  workerSharePercent: number;
  createdBy: string;
}

interface IncomeRecord {
  id?: string;
  workerName: string;
  weight: number;
  pricePerKg: number;
  totalAmount: number;
  workerShare: number;
  workerSharePercent: number;
  date: string;
  goldPrice: number;
  usdRate: number;
  createdBy: string;
}

interface ExpenseRecord {
  id?: string;
  title: string;
  detail?: string;
  amount: number;
  date: string;
  goldPrice: number;
  usdRate: number;
  createdBy: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [incomes, setIncomes] = useState<IncomeRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [view, setView] = useState<'dashboard' | 'income' | 'expense' | 'worker' | 'report' | 'settings'>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'incomes' | 'expenses' | 'workers', name: string } | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [sharedId, setSharedId] = useState<string | null>(null);

  // Handle Share Link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const share = params.get('share');
    if (share) {
      setSharedId(share);
      setView('report');
    }
  }, []);

  // Get real registration count
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const coll = collection(db, 'registrations');
        const snapshot = await getCountFromServer(coll);
        // Show strictly real registration count from the database
        setUserCount(snapshot.data().count);
      } catch (error) {
        console.error("Error fetching registration count:", error);
        setUserCount(842); // Fallback
      }
    };
    fetchCount();
  }, []);

  const startDemo = () => {
    // Generate mock data for the year 2025 (2568 BE)
    const demoIncomes: IncomeRecord[] = [];
    const demoExpenses: ExpenseRecord[] = [];
    const demoWorkers: Worker[] = [
      { name: 'นายเก่ง', createdBy: 'demo' },
      { name: 'นายเฮง', createdBy: 'demo' },
      { name: 'นายรวย', createdBy: 'demo' }
    ];
    
    // Selling rubber twice a month
    for (let month = 0; month < 12; month++) {
      for (let sale = 1; sale <= 2; sale++) {
        const day = sale === 1 ? 5 : 20;
        const dateStr = `2025-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T08:00:00Z`;
        
        demoWorkers.forEach(worker => {
          const weight = 40 + Math.random() * 60;
          const price = 45 + Math.random() * 15;
          const total = weight * price;
          const share = total * 0.5;
          
          demoIncomes.push({
            workerName: worker.name,
            weight: Number(weight.toFixed(2)),
            pricePerKg: Number(price.toFixed(2)),
            totalAmount: total,
            workerShare: share,
            workerSharePercent: 0.5,
            date: dateStr,
            goldPrice: 42000 + (Math.random() * 2000),
            usdRate: 34 + (Math.random() * 2),
            createdBy: 'demo'
          });
        });
      }
      
    // Monthly expenses
      // Fixed items
      demoExpenses.push({
        title: 'ปุ๋ยและสารกำจัดศัตรูพืช',
        detail: `งวดประจำเดือน ${month + 1}`,
        amount: 1500 + Math.random() * 2000,
        date: `2025-${(month + 1).toString().padStart(2, '0')}-28T10:00:00Z`,
        goldPrice: 0, usdRate: 0, createdBy: 'demo'
      });

      demoExpenses.push({
        title: 'น้ำกรด',
        detail: 'น้ำกรดจับตัวยาง',
        amount: 400 + Math.random() * 200,
        date: `2025-${(month + 1).toString().padStart(2, '0')}-10T09:00:00Z`,
        goldPrice: 0, usdRate: 0, createdBy: 'demo'
      });

      demoExpenses.push({
        title: 'น้ำมันตัดหญ้า/รถไถ',
        detail: 'ดีเซลและเบนซิน 95',
        amount: 800 + Math.random() * 500,
        date: `2025-${(month + 1).toString().padStart(2, '0')}-15T11:00:00Z`,
        goldPrice: 0, usdRate: 0, createdBy: 'demo'
      });

      demoExpenses.push({
        title: 'ถุงยัดยางพารา',
        detail: 'อุปกรณ์เก็บผลผลิต',
        amount: 300 + Math.random() * 150,
        date: `2025-${(month + 1).toString().padStart(2, '0')}-05T14:00:00Z`,
        goldPrice: 0, usdRate: 0, createdBy: 'demo'
      });

      // Seasonal items: Red lime at the end of the season (around Feb-April)
      if (month >= 9) { // Last 3 months of the simulation
        demoExpenses.push({
          title: 'ปูนแดงทาหน้ายาง',
          detail: 'บำรุงหน้ายางพักกรีด',
          amount: 600 + Math.random() * 300,
          date: `2025-${(month + 1).toString().padStart(2, '0')}-25T08:00:00Z`,
          goldPrice: 0, usdRate: 0, createdBy: 'demo'
        });
      }
    }

    setWorkers(demoWorkers);
    setIncomes(demoIncomes.sort((a, b) => b.date.localeCompare(a.date)));
    setExpenses(demoExpenses.sort((a, b) => b.date.localeCompare(a.date)));
    setSettings({ workerSharePercent: 0.5, createdBy: 'demo' });
    setIsDemo(true);
    setUser({ uid: 'demo', displayName: 'ผู้เข้าชม (Demo)', photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png', email: 'demo@example.com' } as any);
  };

  const handleLogOut = async () => {
    if (isDemo) {
      setUser(null);
      setIsDemo(false);
      setIncomes([]);
      setExpenses([]);
      setWorkers([]);
      setSettings(null);
    } else {
      await logOut();
    }
  };

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync Documents
  useEffect(() => {
    const effectiveUid = sharedId || (user ? user.uid : null);
    
    if (!effectiveUid || isDemo) {
      if (!isDemo && !sharedId) {
        setIncomes([]);
        setExpenses([]);
      }
      // If we have a sharedId but no user, we still want to fetch
      if (!sharedId) return;
    }

    const targetUid = effectiveUid!;

    const initUser = async () => {
      if (!user || user.uid !== targetUid) return;
      // 1. Mark registration if not exists
      try {
        const regRef = doc(db, 'registrations', targetUid);
        const regSnap = await getDoc(regRef);
        if (!regSnap.exists()) {
          await setDoc(regRef, { 
            email: user.email, 
            joinedAt: serverTimestamp(),
            lastSeen: serverTimestamp()
          });
        }
      } catch (e) {
        console.error("Reg error:", e);
      }
    };
    initUser();

    const qIncome = query(collection(db, 'incomes'), where('createdBy', '==', targetUid), orderBy('date', 'desc'));
    const unsubscribeIncome = onSnapshot(qIncome, (snapshot) => {
      setIncomes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncomeRecord)));
    });

    const qExpense = query(collection(db, 'expenses'), where('createdBy', '==', targetUid), orderBy('date', 'desc'));
    const unsubscribeExpense = onSnapshot(qExpense, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseRecord)));
    });

    const qWorkers = query(collection(db, 'workers'), where('createdBy', '==', targetUid));
    const unsubscribeWorkers = onSnapshot(qWorkers, async (snapshot) => {
      if (snapshot.empty && user && user.uid === targetUid) {
        // Initialize with default worker
        await addDoc(collection(db, 'workers'), { name: 'ตนเอง', createdBy: targetUid });
      } else {
        setWorkers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Worker)));
      }
    });

    const qSettings = query(collection(db, 'settings'), where('createdBy', '==', targetUid));
    const unsubscribeSettings = onSnapshot(qSettings, async (snapshot) => {
      if (snapshot.empty && user && user.uid === targetUid) {
        await addDoc(collection(db, 'settings'), { workerSharePercent: 1.0, createdBy: targetUid });
      } else {
        const s = snapshot.docs[0];
        if (s) setSettings({ id: s.id, ...s.data() } as UserSettings);
      }
    });

    return () => {
      unsubscribeIncome();
      unsubscribeExpense();
      unsubscribeWorkers();
      unsubscribeSettings();
    };
  }, [user, sharedId, isDemo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }} 
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-emerald-600 font-medium font-sans"
        >
          กำลังโหลด...
        </motion.div>
      </div>
    );
  }

  if (!user && !sharedId) {
    return (
      <div className="min-h-screen bg-white flex overflow-hidden">
        {/* Left Side: Illustration & Branding */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-emerald-900 items-center justify-center p-12 overflow-hidden">
          {/* Animated Background Decorative Elements */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-emerald-800 rounded-full blur-3xl opacity-50" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-emerald-700 rounded-full blur-3xl opacity-30" />
          
          <img 
            src="https://picsum.photos/seed/rubber-plantation/1200/1600" 
            alt="สวนยางพารา" 
            className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40"
            referrerPolicy="no-referrer"
          />

          <div className="relative z-10 max-w-lg">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-emerald-400 rounded-2xl shadow-xl shadow-emerald-950/20">
                  <Activity className="w-8 h-8 text-emerald-950" />
                </div>
                <span className="text-3xl font-black text-white tracking-tight">ระบบสวนยาง</span>
              </div>
              
              <h2 className="text-5xl font-black text-white leading-tight mb-8">
                เริ่มจัดการ <br />
                <span className="text-emerald-400 font-serif italic font-normal text-6xl">กำไรสวนยาง</span> <br />
                อย่างมืออาชีพ
              </h2>

              <div className="space-y-6">
                {[
                  { icon: <TrendingUp className="text-emerald-400" />, title: "บันทึกรายรับแม่นยำ", desc: "คำนวณส่วนแบ่งลูกน้องและเปอร์เซ็นต์อัตโนมัติ" },
                  { icon: <PieChart className="text-emerald-400" />, title: "สรุปงบประมาณชัดเจน", desc: "ดูภาพรวมกำไรขาดทุนได้ทันทีผ่านกราฟ" },
                  { icon: <Users className="text-emerald-400" />, title: "ระบบจัดการคนงาน", desc: "สรุปยอดค้างจ่ายและผลงานรายบุคคล" }
                ].map((item, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + (i * 0.1) }}
                    className="flex gap-4 items-start"
                  >
                    <div className="mt-1">{item.icon}</div>
                    <div>
                      <h4 className="text-white font-bold">{item.title}</h4>
                      <p className="text-emerald-200/60 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Right Side: Sign-In Box */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-slate-50 relative">
          {/* Subtle decoration for mobile */}
          <div className="lg:hidden absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-emerald-100 rounded-full blur-3xl opacity-50 pointer-events-none" />

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <div className="text-center lg:text-left mb-10">
              <div className="lg:hidden inline-flex items-center justify-center p-3 bg-emerald-600 rounded-2xl shadow-lg mb-6">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">ยินดีต้อนรับ</h1>
              <p className="text-slate-500 font-medium">เข้าสู่ระบบเพื่อเริ่มจัดการข้อมูลสวนยางของคุณ</p>
            </div>

            <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-110 duration-500" />
              
              <div className="relative z-10">
                <button 
                  onClick={signIn}
                  className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-4 px-6 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-300 group ring-4 ring-transparent hover:ring-slate-100 mb-4"
                >
                  <div className="bg-white p-1.5 rounded-lg">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="กูเกิล" className="w-5 h-5" />
                  </div>
                  <span>เข้าสู่ระบบด้วยกูเกิล</span>
                </button>

                <button 
                  onClick={startDemo}
                  className="w-full flex items-center justify-center gap-4 bg-emerald-50 text-emerald-700 py-4 px-6 rounded-2xl font-bold hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-100"
                >
                  <Activity size={20} className="text-emerald-500" />
                  <span>ทดลองใช้งานระบบ (ทดลอง)</span>
                </button>

                <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col gap-4">
                  <div className="flex items-center gap-3 text-emerald-600 text-[10px] font-black uppercase tracking-widest justify-center">
                    <CheckCircle size={14} />
                    <span>เกษตรกรเลือกลงทะเบียนใช้งานแล้ว {userCount.toLocaleString('th-TH')} บัญชี</span>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed max-w-[240px] mx-auto">
                    การเข้าสู่ระบบแสดงว่าคุณยอมรับข้อตกลงและนโยบายความเป็นส่วนตัวของระบบจัดการสวนยาง
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-12 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-4">จัดทำโดย ทีมผู้พัฒนาระบบสวนยาง</p>
              <div className="flex justify-center gap-4">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-200" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-200" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 font-sans overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-slate-900 sticky top-0 h-screen overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-emerald-400" />
            <span className="font-bold text-xl tracking-tight text-white">ระบบสวนยาง</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">ระบบจัดการสวนยาง</p>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">เมนูหลัก</div>
          {!sharedId || user ? (
            <>
              <NavItem active={view === 'dashboard'} icon={<PieChart size={18} />} label="ภาพรวม" onClick={() => setView('dashboard')} />
              <NavItem active={view === 'income'} icon={<TrendingUp size={18} />} label="บันทึกรายรับ" onClick={() => setView('income')} />
              <NavItem active={view === 'expense'} icon={<TrendingDown size={18} />} label="บันทึกรายจ่าย" onClick={() => setView('expense')} />
              <NavItem active={view === 'worker'} icon={<Users size={18} />} label="สรุปยอดคนงาน" onClick={() => setView('worker')} />
              <NavItem active={view === 'report'} icon={<FileText size={18} />} label="รายงานประจำปี" onClick={() => setView('report')} />
              <NavItem active={view === 'settings'} icon={<Settings size={18} />} label="ตั้งค่าระบบ" onClick={() => setView('settings')} />
            </>
          ) : (
            <NavItem active={true} icon={<FileText size={18} />} label="รายงานรายฤดูกาล" onClick={() => setView('report')} />
          )}
        </nav>

        <div className="p-4 mt-auto">
          {user ? (
            <div className="bg-slate-800 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
                <div className="overflow-hidden">
                  <p className="font-medium text-xs text-white truncate">{user.displayName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogOut}
                className="flex items-center justify-center gap-2 w-full py-2 bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors text-[10px] font-bold uppercase tracking-wider"
              >
                <LogOut size={14} />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl p-4 mb-4">
              <button 
                onClick={() => { setSharedId(null); window.history.replaceState({}, '', window.location.pathname); }}
                className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 text-white rounded-xl transition-all hover:bg-emerald-500 text-[10px] font-bold uppercase tracking-wider"
              >
                <LogIn size={14} />
                <span>เข้าสู่ระบบจัดการสวน</span>
              </button>
            </div>
          )}
          <div className="text-center">
             <p className="text-[10px] text-slate-600 italic">เวอร์ชัน 1.0</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {sharedId && !user && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 text-center text-[11px] font-black uppercase tracking-[0.1em] shadow-lg z-[60] flex items-center justify-center gap-4 shrink-0">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span>คุณกำลังดูรายงานที่แชร์มาจากชาวสวนท่านอื่น</span>
             </div>
             <button 
                onClick={() => { setSharedId(null); window.history.replaceState({}, '', window.location.pathname); }} 
                className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-all flex items-center gap-1.5 active:scale-95"
             >
                <LogIn size={14} />
                <span>เข้าสู่ระบบเพื่อจัดการสวนของคุณเอง</span>
             </button>
          </div>
        )}
        {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold tracking-tight text-slate-800">จัดการสวนยาง</span>
        </div>
        <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-500 hover:text-slate-900 transition-colors">
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 left-0 bottom-0 w-72 bg-slate-900 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Activity className="w-6 h-6 text-emerald-400" />
                   <span className="font-bold text-white">จัดการสวนยาง</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
              </div>
              <nav className="flex-1 py-4 overflow-y-auto">
                <NavItem active={view === 'dashboard'} icon={<PieChart size={18} />} label="ภาพรวม" onClick={() => { setView('dashboard'); setSidebarOpen(false); }} />
                <NavItem active={view === 'income'} icon={<TrendingUp size={18} />} label="บันทึกรายรับ" onClick={() => { setView('income'); setSidebarOpen(false); }} />
                <NavItem active={view === 'expense'} icon={<TrendingDown size={18} />} label="บันทึกรายจ่าย" onClick={() => { setView('expense'); setSidebarOpen(false); }} />
                <NavItem active={view === 'worker'} icon={<Users size={18} />} label="สรุปยอดคนงาน" onClick={() => { setView('worker'); setSidebarOpen(false); }} />
                <NavItem active={view === 'report'} icon={<FileText size={18} />} label="รายงานประจำปี" onClick={() => { setView('report'); setSidebarOpen(false); }} />
                <NavItem active={view === 'settings'} icon={<Settings size={18} />} label="ตั้งค่าระบบ" onClick={() => { setView('settings'); setSidebarOpen(false); }} />
              </nav>
              <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 mb-4">
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
                  <div className="overflow-hidden">
                    <p className="font-medium text-xs text-white truncate">{user.displayName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { handleLogOut(); setSidebarOpen(false); }}
                  className="w-full py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  ออกจากระบบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 lg:p-8 p-4 pt-20 lg:pt-8 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {view === 'dashboard' && <Dashboard incomes={incomes} expenses={expenses} workers={workers} settings={settings} />}
          {view === 'income' && <IncomeView incomes={incomes} workers={workers} settings={settings} onDelete={(id) => setConfirmDelete({ id, type: 'incomes', name: 'รายการขายยาง' })} />}
          {view === 'expense' && <ExpenseView expenses={expenses} onDelete={(id) => setConfirmDelete({ id, type: 'expenses', name: 'รายการรายจ่าย' })} />}
          {view === 'worker' && <WorkerView incomes={incomes} workers={workers} settings={settings} />}
          {view === 'report' && <AnnualReport incomes={incomes} expenses={expenses} user={user} />}
          {view === 'settings' && <SettingsView workers={workers} settings={settings} onDelete={(id, name) => setConfirmDelete({ id, type: 'workers', name: `คนงาน ${name}` })} />}
        </div>
      </main>

      <ConfirmDialog 
        isOpen={!!confirmDelete} 
        onClose={() => setConfirmDelete(null)} 
        onConfirm={async () => {
          if (confirmDelete) {
            try {
              await deleteDoc(doc(db, confirmDelete.type, confirmDelete.id));
              setConfirmDelete(null);
            } catch (err) {
              console.error(err);
              alert('เกิดข้อผิดพลาดในการลบข้อมูล');
            }
          }
        }} 
        title="ยืนยันการลบ"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบ ${confirmDelete?.name}? การกระทำนี้ไม่สามารถย้อนคืนได้`}
      />
    </div>
  </div>
  );
}

// --- Components ---

function NavItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-6 py-3 transition-colors duration-200 font-medium text-sm border-l-4",
        active 
          ? "bg-emerald-600 text-white border-emerald-400" 
          : "text-slate-400 hover:bg-slate-800 hover:text-white border-transparent"
      )}
    >
      <span className={cn(active ? "text-white" : "text-slate-500")}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function Dashboard({ incomes, expenses, workers, settings }: { incomes: IncomeRecord[], expenses: ExpenseRecord[], workers: Worker[], settings: UserSettings | null }) {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const sharePercent = settings?.workerSharePercent ?? DEFAULT_WORKER_SHARE;

  const monthlyIncomes = incomes.filter(r => {
    const d = parseISO(r.date);
    return getMonth(d) === currentMonth && getYear(d) === currentYear;
  });
  const monthlyExpenses = expenses.filter(r => {
    const d = parseISO(r.date);
    return getMonth(d) === currentMonth && getYear(d) === currentYear;
  });

  const totalMonthlyIncome = monthlyIncomes.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalMonthlyExpense = monthlyExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const netProfit = totalMonthlyIncome - totalMonthlyExpense;
  const totalWeight = monthlyIncomes.reduce((acc, curr) => acc + curr.weight, 0);

  // Chart Data (Last 6 Months)
  const chartData = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const m = getMonth(date);
      const y = getYear(date);
      
      const mi = incomes.filter(r => {
        const d = parseISO(r.date);
        return getMonth(d) === m && getYear(d) === y;
      }).reduce((acc, curr) => acc + curr.totalAmount, 0);

      const me = expenses.filter(r => {
        const d = parseISO(r.date);
        return getMonth(d) === m && getYear(d) === y;
      }).reduce((acc, curr) => acc + curr.amount, 0);

      data.push({
        name: format(date, 'MMM', { locale: th }),
        income: mi,
        expense: me,
        profit: mi - me
      });
    }
    return data;
  }, [incomes, expenses]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">แผงควบคุม</h2>
          <p className="text-slate-500 text-sm font-sans">สรุปผลการดำเนินงานประจำเดือน {formatThaiBE(new Date(), 'MMMM yyyy')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickLink label="ราคาทอง" url="https://www.goldtraders.or.th/" color="bg-amber-50 text-amber-600 border-amber-100" />
          <QuickLink label="ค่าเงิน USD" url="https://www.google.com/finance/quote/USD-THB" color="bg-blue-50 text-blue-600 border-blue-100" />
          <QuickLink label="ราคายางตลาดโลก" url="https://misdata.rubberthaiecon.com/report/rbprice.php" color="bg-emerald-50 text-emerald-600 border-emerald-100" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard 
          label="รายรับรวม (เดือนนี้)" 
          value={totalMonthlyIncome} 
          unit="฿"
          color="text-emerald-600"
        />
        <SummaryCard 
          label="รายจ่ายรวม (เดือนนี้)" 
          value={totalMonthlyExpense} 
          unit="฿"
          color="text-rose-600"
        />
        <SummaryCard 
          label="ปริมาณยางรวม" 
          value={totalWeight} 
          unit="กก."
          color="text-slate-800"
        />
        <SummaryCard 
          label="กำไรสุทธิ" 
          value={netProfit} 
          unit="฿"
          color="text-blue-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white flex flex-col rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-white flex justify-between items-center">
            <h4 className="font-bold text-slate-700">รายการขายยางล่าสุด</h4>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">อัปเดตอัตโนมัติ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-[10px] text-slate-400 uppercase border-b">
                  <th className="p-4 font-bold">วันที่</th>
                  <th className="p-4 font-bold">คนงาน</th>
                  <th className="p-4 font-bold">น้ำหนัก (กก.)</th>
                  <th className="p-4 font-bold">ราคา/กก.</th>
                  <th className="p-4 font-bold text-right text-emerald-600">ส่วนแบ่ง (฿)</th>
                  <th className="p-4 font-bold text-right">ยอดรวม (฿)</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {monthlyIncomes.slice(0, 5).map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-slate-600">{formatThaiBE(row.date, 'dd MMM yy')}</td>
                    <td className="p-4 font-medium text-slate-900">{row.workerName}</td>
                    <td className="p-4 font-mono">{formatWeight(row.weight)}</td>
                    <td className="p-4 italic font-serif text-slate-500">฿{formatMoney(row.pricePerKg)}</td>
                    <td className="p-4 text-right text-emerald-600 font-bold">
                       ฿{formatMoney(row.workerShare)}
                       <span className="text-[9px] ml-1 opacity-70">({(row.workerSharePercent ? row.workerSharePercent * 100 : (row.totalAmount > 0 ? (row.workerShare / row.totalAmount) * 100 : sharePercent * 100)).toFixed(0)}%)</span>
                    </td>
                    <td className="p-4 text-right font-bold text-slate-900">
                      ฿{formatMoney(row.totalAmount)}
                    </td>
                  </tr>
                ))}
                {monthlyIncomes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">ไม่มีข้อมูลการขายในเดือนนี้</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="font-bold text-slate-700 mb-4 flex items-center">
              <span className="mr-2">🤝</span> ส่วนแบ่งลูกน้อง ({(sharePercent * 100).toFixed(0)}%)
            </h4>
            <div className="space-y-4">
              {workers.map((worker, idx) => {
                const share = monthlyIncomes
                  .filter(r => r.workerName === worker.name)
                  .reduce((acc, curr) => acc + curr.workerShare, 0);
                const totalShare = monthlyIncomes.reduce((acc, curr) => acc + curr.workerShare, 0) || 1;
                const colors = ['bg-emerald-500', 'bg-amber-500', 'bg-blue-500', 'bg-rose-500', 'bg-purple-500'];

                return (
                  <div key={worker.id || `dashboard-worker-${idx}`} className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 font-medium">{worker.name}</span>
                      <span className="text-sm font-bold text-slate-900">฿{formatMoney(share)}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(share / totalShare) * 100}%` }}
                        className={cn("h-full", colors[idx % colors.length])} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col">
            <h4 className="font-bold text-slate-700 mb-4">สถิติรายฤดูกาล</h4>
            <div className="flex-1 min-h-[120px] mb-4">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <Bar dataKey="income" fill="#10B981" radius={[2, 2, 0, 0]} />
                  </BarChart>
               </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>{chartData[0]?.name}</span>
              <span>{chartData[2]?.name}</span>
              <span>{chartData[5]?.name}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, unit, color }: { label: string, value: number, unit: string, color: string }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <h3 className={cn("text-2xl font-black mt-2 tabular-nums", color)}>
        {unit === '฿' ? `฿${formatMoney(value)}` : `${formatWeight(value)} ${unit}`}
      </h3>
    </div>
  );
}

function QuickLink({ label, url, color }: { label: string, url: string, color: string }) {
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
        color
      )}
    >
      <ArrowUpRight size={14} />
      <span>{label}</span>
    </a>
  );
}

function IncomeView({ incomes, workers, settings, onDelete }: { incomes: IncomeRecord[], workers: Worker[], settings: UserSettings | null, onDelete: (id: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const sharePercent = settings?.workerSharePercent ?? DEFAULT_WORKER_SHARE;
  const [formData, setFormData] = useState({
    workerName: workers[0]?.name || '',
    weight: 0,
    pricePerKg: 0
  });

  useEffect(() => {
    if (workers.length > 0 && !formData.workerName) {
      setFormData(prev => ({ ...prev, workerName: workers[0].name }));
    }
  }, [workers]);

  // Auto-fill price from today's first record
  useEffect(() => {
    if (isAdding && formData.pricePerKg === 0 && incomes.length > 0) {
      const todayString = new Date().toISOString().split('T')[0];
      // Records are ordered by date desc in the query, so the oldest of today is at the end of the filtered list
      const todaysIncomes = incomes.filter(i => i.date.startsWith(todayString));
      if (todaysIncomes.length > 0) {
        // Get the "first" (oldest) price of today
        const firstPriceToday = todaysIncomes[todaysIncomes.length - 1].pricePerKg;
        setFormData(prev => ({ ...prev, pricePerKg: firstPriceToday }));
      }
    }
  }, [isAdding, incomes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    const totalAmount = formData.weight * formData.pricePerKg;
    const record: IncomeRecord = {
      ...formData,
      totalAmount,
      workerShare: totalAmount * sharePercent,
      workerSharePercent: sharePercent,
      date: new Date().toISOString(),
      goldPrice: 0,
      usdRate: 0,
      createdBy: auth.currentUser.uid
    };

    try {
      await addDoc(collection(db, 'incomes'), record);
      setIsAdding(false);
      // Reset weight but keep price if it was already set today
      setFormData(prev => ({ 
        workerName: workers[0]?.name || '', 
        weight: 0, 
        pricePerKg: prev.pricePerKg 
      }));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <header className="h-16 bg-white border-b flex items-center justify-between px-8 rounded-2xl shadow-sm border-slate-200">
        <div className="flex space-x-8">
           <h2 className="text-xl font-bold tracking-tight text-slate-800">บันทึกรายรับ</h2>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />}
          <span>{isAdding ? 'ยกเลิก' : 'เพิ่มรายการใหม่'}</span>
        </button>
      </header>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm"
          >
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ชื่อคนงาน</label>
                <select 
                  value={formData.workerName}
                  onChange={e => setFormData({ ...formData, workerName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                >
                  {workers.map((w, idx) => <option key={w.id || `opt-${idx}`} value={w.name}>{w.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">น้ำหนัก (กก.)</label>
                <input 
                  type="number" step="0.01" required
                  value={formData.weight || ''}
                  onChange={e => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ราคา/กก. (฿)</label>
                <input 
                  type="number" step="0.01" required
                  value={formData.pricePerKg || ''}
                  onChange={e => setFormData({ ...formData, pricePerKg: parseFloat(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                  placeholder="0.00"
                />
              </div>
              <button type="submit" className="bg-slate-900 text-white rounded-lg p-2.5 text-sm font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-sm">
                บันทึกบิล
              </button>
            </form>
            <div className="bg-slate-50 p-4 px-6 border-t border-slate-100 flex flex-wrap gap-8 text-[11px] font-bold uppercase tracking-wider">
               <div className="flex gap-2 items-center">
                  <span className="text-slate-400">เงินรวม:</span>
                  <span className="text-emerald-600 font-black">฿{formatMoney(formData.weight * formData.pricePerKg)}</span>
               </div>
               <div className="flex gap-2 items-center">
                  <span className="text-slate-400">ส่วนแบ่ง ({(sharePercent * 100).toFixed(0)}%):</span>
                  <span className="text-blue-600 font-black">฿{formatMoney(formData.weight * formData.pricePerKg * sharePercent)}</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b bg-white">
          <h4 className="font-bold text-slate-700">ประวัติการขายยางทั้งหมด</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-[10px] text-slate-400 uppercase border-b">
                <th className="p-4 font-bold">วันที่ขาย</th>
                <th className="p-4 font-bold">ชื่อคนงาน</th>
                <th className="p-4 font-bold">น้ำหนัก (กก.)</th>
                <th className="p-4 font-bold">ราคา/กก.</th>
                <th className="p-4 font-bold">ส่วนแบ่งคนงาน</th>
                <th className="p-4 font-bold text-right">ยอดรวมบิล</th>
                <th className="p-4 font-bold"></th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y">
              {incomes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 italic">ยังไม่มีข้อมูลรายรับในระบบ</td>
                </tr>
              ) : incomes.map((row, idx) => {
                const currentDate = parseISO(row.date);
                const prevDate = idx > 0 ? parseISO(incomes[idx - 1].date) : null;
                const isNewMonth = !prevDate || getMonth(currentDate) !== getMonth(prevDate) || getYear(currentDate) !== getYear(prevDate);

                return (
                  <React.Fragment key={row.id || `income-${idx}`}>
                    {isNewMonth && (
                      <tr className="bg-slate-50 border-y border-slate-100">
                        <td colSpan={7} className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {formatThaiBE(currentDate, 'MMMM yyyy')}
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4 text-slate-500 whitespace-nowrap">{formatThaiBE(row.date, 'dd MMM yy HH:mm')}</td>
                      <td className="p-4 font-medium text-slate-900">{row.workerName}</td>
                      <td className="p-4 font-mono text-slate-600">{formatWeight(row.weight)}</td>
                      <td className="p-4 italic font-serif text-slate-500">฿{formatMoney(row.pricePerKg)}</td>
                      <td className="p-4 text-blue-600 font-semibold">
                        ฿{formatMoney(row.workerShare)}
                        <span className="text-[10px] text-slate-400 ml-1 font-normal">({(row.workerSharePercent ? row.workerSharePercent * 100 : (row.totalAmount > 0 ? (row.workerShare / row.totalAmount) * 100 : sharePercent * 100)).toFixed(0)}%)</span>
                      </td>
                      <td className="p-4 text-right font-black text-slate-900">฿{formatMoney(row.totalAmount)}</td>
                      <td className="p-4 w-10 text-center">
                        <button 
                          onClick={() => onDelete(row.id!)}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExpenseView({ expenses, onDelete }: { expenses: ExpenseRecord[], onDelete: (id: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    detail: '',
    amount: 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    const record: ExpenseRecord = {
      ...formData,
      date: new Date().toISOString(),
      goldPrice: 0,
      usdRate: 0,
      createdBy: auth.currentUser.uid
    };

    try {
      await addDoc(collection(db, 'expenses'), record);
      setIsAdding(false);
      setFormData({ title: '', detail: '', amount: 0 });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <header className="h-16 bg-white border-b flex items-center justify-between px-8 rounded-2xl shadow-sm border-slate-200">
        <h2 className="text-xl font-bold tracking-tight text-slate-800">บันทึกรายจ่าย</h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-rose-700 transition-colors flex items-center gap-2"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />}
          <span>{isAdding ? 'ยกเลิก' : 'เพิ่มรายจ่าย'}</span>
        </button>
      </header>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            key="expense-form-animate-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm"
          >
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">หัวข้อรายจ่าย</label>
                  <input 
                    type="text" required
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                    placeholder="เช่น ค่าปุ๋ย, อุปกรณ์สวน"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">จำนวนเงิน (฿)</label>
                  <input 
                    type="number" step="0.01" required
                    value={formData.amount || ''}
                    onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">รายละเอียดเพิ่มเติม</label>
                <textarea 
                  value={formData.detail}
                  onChange={e => setFormData({ ...formData, detail: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none h-24 resize-none"
                  placeholder="ใส่รายละเอียดที่นี่..."
                />
              </div>
              <div className="flex justify-end">
                <button type="submit" className="bg-slate-900 text-white rounded-lg px-8 py-2.5 text-sm font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-sm">
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-[10px] text-slate-400 uppercase border-b">
                <th className="p-4 font-bold">วันที่</th>
                <th className="p-4 font-bold">รายการ</th>
                <th className="p-4 font-bold">รายละเอียด</th>
                <th className="p-4 font-bold text-right">ยอดเงินจ่าย</th>
                <th className="p-4 font-bold text-center"></th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 italic">ยังไม่มีข้อมูลรายจ่ายในขณะนี้</td>
                </tr>
              ) : expenses.map((row, idx) => (
                <tr key={row.id || `expense-${idx}`} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4 text-slate-500">{formatThaiBE(row.date, 'dd MMM yy')}</td>
                  <td className="p-4 font-medium text-slate-900">{row.title}</td>
                  <td className="p-4 text-slate-400 max-w-xs truncate">{row.detail || '-'}</td>
                  <td className="p-4 text-right font-black text-rose-600">฿{formatMoney(row.amount)}</td>
                  <td className="p-4 w-10 text-center">
                    <button 
                      onClick={() => onDelete(row.id!)}
                      className="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WorkerView({ incomes, workers, settings }: { incomes: IncomeRecord[], workers: Worker[], settings: UserSettings | null }) {
  const [tab, setTab] = useState<'monthly' | 'season'>('monthly');
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  const sharePercent = settings?.workerSharePercent ?? DEFAULT_WORKER_SHARE;
  
  const years = useMemo(() => {
    const all = incomes.map(i => getYear(parseISO(i.date)));
    const yearList = Array.from(new Set(all)).sort((a, b) => b - a);
    return yearList.length > 0 ? yearList : [getYear(new Date())];
  }, [incomes]);

  const [selectedYear, setSelectedYear] = useState(years[0]);

  const filteredIncomes = useMemo(() => {
    if (tab === 'monthly') {
      return incomes.filter(r => r.date.startsWith(selectedMonth));
    } else {
      const start = setYear(new Date(selectedYear, 4, 1, 0, 0, 0), selectedYear);
      const end = setYear(new Date(selectedYear + 1, 3, 30, 23, 59, 59), selectedYear + 1);
      return incomes.filter(r => isWithinInterval(parseISO(r.date), { start, end }));
    }
  }, [tab, selectedMonth, selectedYear, incomes]);

  const stats = workers.map(worker => {
    const workerIncomes = filteredIncomes.filter(r => r.workerName === worker.name);
    const weight = workerIncomes.reduce((acc, curr) => acc + curr.weight, 0);
    const totalAmount = workerIncomes.reduce((acc, curr) => acc + curr.totalAmount, 0);
    const share = workerIncomes.reduce((acc, curr) => acc + curr.workerShare, 0);
    const avgPrice = weight > 0 ? totalAmount / weight : 0;
    return { id: worker.id, name: worker.name, weight, totalAmount, share, avgPrice, count: workerIncomes.length };
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1.5 rounded-2xl w-fit">
          <button 
            onClick={() => setTab('monthly')}
            className={cn("px-6 py-2.5 rounded-xl text-sm font-bold transition-all", tab === 'monthly' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            สรุปรายงวด/รายเดือน
          </button>
          <button 
            onClick={() => setTab('season')}
            className={cn("px-6 py-2.5 rounded-xl text-sm font-bold transition-all", tab === 'season' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            สรุปรายฤดูกาล
          </button>
        </div>

        <div className="flex items-center gap-3">
           {tab === 'monthly' && (
             <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl flex items-center gap-3">
                <Calendar size={18} className="text-slate-400" />
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 outline-none"
                />
             </div>
           )}
           {tab === 'season' && (
             <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">เริ่มฤดูกาล:</span>
                <select 
                  value={selectedYear}
                  onChange={e => setSelectedYear(parseInt(e.target.value))}
                  className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 outline-none"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
             </div>
           )}
        </div>
      </div>

      <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {stats.map((s, idx) => {
              const colors = ['text-emerald-600', 'text-blue-600', 'text-amber-600', 'text-rose-600', 'text-purple-600'];
              const bgColors = ['bg-emerald-50', 'bg-blue-50', 'bg-amber-50', 'bg-rose-50', 'bg-purple-50'];
              
              return (
                <div key={s.id || `stat-${idx}`} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-8 border-b border-slate-50 flex items-center gap-6">
                    <div className={cn("w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black shrink-0 border border-white shadow-xl", bgColors[idx % bgColors.length], colors[idx % colors.length])}>
                        {s.name.charAt(3)}
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900">{s.name}</h3>
                        <p className="text-slate-400 text-sm font-medium">สรุปผลงาน: {tab === 'monthly' ? formatThaiBE(parseISO(selectedMonth + '-01'), 'MMMM yyyy') : `ฤดูกาล พ.ศ. ${selectedYear + 543}/${selectedYear + 1 + 543}`}</p>
                    </div>
                  </div>
                  
                  <div className="p-8 grid grid-cols-2 gap-8 bg-white text-left">
                    <div className="space-y-1 text-left">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">น้ำหนักยางรวม</p>
                      <p className="text-2xl font-black text-slate-900 tabular-nums">{formatWeight(s.weight)} <span className="text-sm font-bold text-slate-400 ml-1">กก.</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ราคาเฉลี่ย</p>
                      <p className="text-2xl font-black text-slate-900 tabular-nums">฿{formatMoney(s.avgPrice)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เงินรวมบิลทั้งหมด</p>
                      <p className="text-2xl font-black text-slate-900 tabular-nums">฿{formatMoney(s.totalAmount)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest underline decoration-2 underline-offset-4">ยอดรับส่วนแบ่งลูกน้อง</p>
                      <p className="text-2xl font-black text-emerald-600 tabular-nums">
                      ฿{formatMoney(s.share)}
                    </p>
                    </div>
                  </div>

                  <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-50 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400">จำนวนการบันทึก: {s.count} บิล</span>
                    <div className="flex -space-x-2">
                        {Array.from({ length: Math.min(s.count, 5) }).map((_, i) => (
                          <div key={i} className={cn("w-6 h-6 rounded-full border-2 border-white", bgColors[idx % bgColors.length])} />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-white flex items-center justify-between">
              <h4 className="font-black text-slate-800 uppercase tracking-tight">ตารางรายละเอียดรายบิล</h4>
              <div className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500">
                  {filteredIncomes.length} รายการ
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] text-slate-400 uppercase border-b">
                    <th className="p-5 font-black">วันที่ / รอบ</th>
                    <th className="p-5 font-black">ชื่อคนงาน</th>
                    <th className="p-5 font-black text-right">น้ำหนัก (กก.)</th>
                    <th className="p-5 font-black text-right">ราคา/กก.</th>
                    <th className="p-5 font-black text-right">เงินรวม</th>
                    <th className="p-5 font-black text-center text-slate-400">สัดส่วน (%)</th>
                    <th className="p-5 font-black text-right text-emerald-600">ส่วนแบ่ง (฿)</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y">
                  {filteredIncomes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-16 text-center text-slate-400 italic font-medium">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td>
                    </tr>
                  ) : filteredIncomes.sort((a,b) => b.date.localeCompare(a.date)).map((row, idx) => {
                    const currentDate = parseISO(row.date);
                    const prevDate = idx > 0 ? parseISO(filteredIncomes[idx - 1].date) : null;
                    const isNewMonth = !prevDate || getMonth(currentDate) !== getMonth(prevDate) || getYear(currentDate) !== getYear(prevDate);

                    return (
                      <React.Fragment key={row.id || `f-income-${idx}`}>
                        {isNewMonth && tab === 'season' && (
                          <tr className="bg-slate-50/80 border-y border-slate-100">
                            <td colSpan={7} className="px-5 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {formatThaiBE(currentDate, 'MMMM yyyy')}
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="p-5 text-slate-600 font-medium whitespace-nowrap">{formatThaiBE(row.date, 'dd MMM yy HH:mm')}</td>
                          <td className="p-5 font-bold text-slate-800">{row.workerName}</td>
                          <td className="p-5 text-right font-mono text-slate-600">{formatWeight(row.weight)}</td>
                          <td className="p-5 text-right font-mono italic text-slate-400">฿{formatMoney(row.pricePerKg)}</td>
                          <td className="p-5 text-right font-black text-slate-900">฿{formatMoney(row.totalAmount)}</td>
                          <td className="p-5 text-center font-bold text-slate-500 bg-slate-50/50">
                            {(row.workerSharePercent ? row.workerSharePercent * 100 : (row.totalAmount > 0 ? (row.workerShare / row.totalAmount) * 100 : sharePercent * 100)).toFixed(0)}%
                          </td>
                          <td className="p-5 text-right font-black text-emerald-600">
                            ฿{formatMoney(row.workerShare)}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ workers, settings, onDelete }: { workers: Worker[], settings: UserSettings | null, onDelete: (id: string, name: string) => void }) {
  const [newWorkerName, setNewWorkerName] = useState('');
  const [isUpdatingShare, setIsUpdatingShare] = useState(false);
  const [tempShare, setTempShare] = useState(settings?.workerSharePercent ? (settings.workerSharePercent * 100).toString() : '45');

  useEffect(() => {
    if (settings) {
      setTempShare((settings.workerSharePercent * 100).toString());
    }
  }, [settings]);

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim() || !auth.currentUser) return;
    try {
      await addDoc(collection(db, 'workers'), {
        name: newWorkerName.trim(),
        createdBy: auth.currentUser.uid
      });
      setNewWorkerName('');
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">ตัวเลือกและการตั้งค่า</h2>
          <p className="text-slate-500 text-sm mt-1">จัดการรายชื่อคนงานและสัดส่วนส่วนแบ่งรายได้</p>
        </div>
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
          <Settings size={24} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
           <div className="bg-blue-600 p-8 rounded-3xl shadow-xl shadow-blue-200 text-white">
              <div className="flex items-start gap-4">
                 <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                    <Activity size={20} />
                 </div>
                 <div>
                    <h4 className="font-bold text-lg leading-tight text-white">ตั้งค่าส่วนแบ่งลูกน้อง</h4>
                    <p className="text-blue-100 text-xs mt-2 leading-relaxed opacity-80">
                      ระบบจะใช้ค่าเปอร์เซ็นต์นี้ในการคำนวณเงินให้ลูกน้องโดยอัตโนมัติในทุกๆ บิลที่บันทึก
                    </p>
                 </div>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!auth.currentUser || !settings?.id) return;
                const newPercent = parseFloat(tempShare) / 100;
                if (isNaN(newPercent) || newPercent < 0 || newPercent > 1) return;
                try {
                  setIsUpdatingShare(true);
                  await deleteDoc(doc(db, 'settings', settings.id));
                  await addDoc(collection(db, 'settings'), { 
                    workerSharePercent: newPercent, 
                    createdBy: auth.currentUser.uid 
                  });
                  alert('บันทึกสำเร็จ');
                } catch(err) { console.error(err); }
                finally { setIsUpdatingShare(false); }
              }} className="mt-8 space-y-4">
                <div className="relative">
                  <input 
                    type="number" step="1" required min="0" max="100"
                    value={tempShare}
                    onChange={e => setTempShare(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 pr-12 text-lg font-black text-white focus:ring-2 focus:ring-white/50 transition-all outline-none placeholder:text-white/30"
                    placeholder="เช่น 45"
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white/50 font-black text-xl">%</span>
                </div>
                <button 
                  disabled={isUpdatingShare}
                  type="submit" 
                  className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black text-sm hover:bg-slate-50 transition-all shadow-lg disabled:opacity-50"
                >
                  {isUpdatingShare ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                </button>
              </form>
           </div>

           <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <Plus size={20} />
                </div>
                <h4 className="text-lg font-bold text-slate-800">เพิ่มคนงานใหม่</h4>
             </div>
             <form onSubmit={handleAddWorker} className="space-y-4">
                <input 
                  type="text" required
                  value={newWorkerName}
                  onChange={e => setNewWorkerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                  placeholder="ชื่อ-นามสกุล คนงาน..."
                />
                <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                  เพิ่มเข้าระบบ
                </button>
             </form>
           </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
           <div className="p-8 border-b bg-white flex items-center justify-between">
              <h4 className="font-bold text-slate-800">รายชื่อคนงานทั้งหมด ({workers.length})</h4>
              <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                <Users size={16} />
              </div>
           </div>
           <div className="divide-y divide-slate-50 overflow-y-auto">
              {workers.map((w, idx) => (
                <div key={w.id || `settings-worker-${idx}`} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 text-xl">
                         {w.name.charAt(3)}
                      </div>
                      <span className="font-bold text-slate-700">{w.name}</span>
                   </div>
                   <button 
                    onClick={() => onDelete(w.id!, w.name)}
                    className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                   >
                      <X size={20} />
                   </button>
                </div>
              ))}
              {workers.length === 0 && (
                <div className="p-20 text-center text-slate-300 italic font-medium">ไม่มีข้อมูลคนงาน</div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}

function AnnualReport({ incomes, expenses, user }: { incomes: IncomeRecord[], expenses: ExpenseRecord[], user: any }) {
  const [reportTab, setReportTab] = useState<'season' | 'historical'>('season');
  const [copied, setCopied] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const reportRef = React.useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    const all = [...incomes.map(i => getYear(parseISO(i.date))), ...expenses.map(e => getYear(parseISO(e.date)))];
    const yearList = Array.from(new Set(all)).sort((a, b) => b - a);
    return yearList.length > 0 ? yearList : [getYear(new Date())];
  }, [incomes, expenses]);

  const [selectedYear, setSelectedYear] = useState(years[0]);

  const historicalData = useMemo(() => {
    const recentYears = years.slice(0, 5).reverse();
    return recentYears.map(year => {
      const start = setYear(new Date(year, 4, 1, 0, 0, 0), year);
      const end = setYear(new Date(year + 1, 3, 30, 23, 59, 59), year + 1);
      const fI = incomes.filter(r => isWithinInterval(parseISO(r.date), { start, end }));
      const fE = expenses.filter(r => isWithinInterval(parseISO(r.date), { start, end }));
      const rev = fI.reduce((a, c) => a + c.totalAmount, 0);
      const ws = fI.reduce((a, c) => a + c.workerShare, 0);
      const exp = fE.reduce((a, c) => a + c.amount, 0);
      const weight = fI.reduce((a, c) => a + c.weight, 0);
      const profit = rev - ws - exp;
      const avgPrice = weight > 0 ? (rev / weight) : 0;
      return {
        name: `${year}-${(year + 1).toString().slice(-2)}`,
        revenue: rev,
        expense: ws + exp,
        profit: profit,
        weight: weight,
        avgPrice: avgPrice
      };
    });
  }, [years, incomes, expenses]);

  const seasonData = useMemo(() => {
    const start = setYear(new Date(selectedYear, 4, 1, 0, 0, 0), selectedYear); 
    const end = setYear(new Date(selectedYear + 1, 3, 30, 23, 59, 59), selectedYear + 1); 
    const filteredI = incomes.filter(r => isWithinInterval(parseISO(r.date), { start, end }));
    const filteredE = expenses.filter(r => isWithinInterval(parseISO(r.date), { start, end }));
    const totalRevenue = filteredI.reduce((a, c) => a + c.totalAmount, 0);
    const totalExpenses = filteredE.reduce((a, c) => a + c.amount, 0);
    const totalWeight = filteredI.reduce((a, c) => a + c.weight, 0);
    const totalWorkerShare = filteredI.reduce((a, c) => a + c.workerShare, 0);
    const workerEarnings: Record<string, number> = {};
    filteredI.forEach(item => {
      workerEarnings[item.workerName] = (workerEarnings[item.workerName] || 0) + item.workerShare;
    });
    const netProfit = totalRevenue - totalWorkerShare - totalExpenses;

    const monthlyAnalysis = Array.from({ length: 12 }).map((_, i) => {
      const date = addMonths(new Date(selectedYear, 4, 1), i);
      const m = getMonth(date);
      const y = getYear(date);
      const mIncomes = filteredI.filter(r => getMonth(parseISO(r.date)) === m && getYear(parseISO(r.date)) === y);
      const mi = mIncomes.reduce((a, c) => a + c.totalAmount, 0);
      const mws = mIncomes.reduce((a, c) => a + c.workerShare, 0);
      const mw = mIncomes.reduce((a, c) => a + c.weight, 0);
      const me = filteredE.filter(r => getMonth(parseISO(r.date)) === m && getYear(parseISO(r.date)) === y).reduce((a, c) => a + c.amount, 0);
      
      // Calculate weight per worker for this month
      const workerWeight: any = {
        name: format(date, 'MMM', { locale: th }),
        income: mi,
        expense: mws + me,
        weight: mw,
        avgPrice: mw > 0 ? (mi / mw) : 0
      };

      mIncomes.forEach(inc => {
        workerWeight[inc.workerName] = (workerWeight[inc.workerName] || 0) + inc.weight;
      });

      return workerWeight;
    });

    const activeWorkers = Array.from(new Set(filteredI.map(i => i.workerName)));

    // Expense Breakdown for Pie Chart - Exclude Worker Shares as requested
    const expenseGroups: Record<string, number> = {};

    filteredE.forEach(e => {
      const cat = e.title || 'ไม่มีหัวข้อ';
      expenseGroups[cat] = (expenseGroups[cat] || 0) + e.amount;
    });

    const sortedGroups = Object.entries(expenseGroups)
      .filter(([_, value]) => value > 0)
      .sort((a, b) => b[1] - a[1]);

    const top5 = sortedGroups.slice(0, 5);
    const others = sortedGroups.slice(5).reduce((acc, curr) => acc + curr[1], 0);

    const expenseBreakdown = top5.map(([name, value]) => ({ name, value }));
    if (others > 0) {
      expenseBreakdown.push({ name: 'อื่นๆ', value: others });
    }

    return { 
      totalRevenue, totalExpenses, totalWeight, totalWorkerShare, netProfit, workerEarnings,
      incomes: filteredI, expenses: filteredE, monthlyAnalysis, activeWorkers, expenseBreakdown
    };
  }, [selectedYear, incomes, expenses]);

  const handleCapture = async () => {
    if (!reportRef.current) return;
    
    setIsCapturing(true);
    try {
      // Extended delay to ensure complete rendering of all charts and complex elements
      await new Promise(r => setTimeout(r, 1500));
      
      // Calculate dimensions including extra padding for the "poster" look
      const padding = 80; // Total horizontal/vertical padding (40px each side)
      const contentWidth = Math.max(reportRef.current.offsetWidth, 1200); // Force at least desktop width
      const contentHeight = reportRef.current.offsetHeight;

      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        backgroundColor: '#f8fafc',
        pixelRatio: 2, // 3 was maybe too heavy, 2 is plenty for HD
        width: contentWidth + padding,
        height: contentHeight + padding,
        style: {
          padding: '40px',
          margin: '0',
          width: contentWidth + 'px',
          height: 'auto',
          overflow: 'visible',
          display: 'block'
        },
        filter: (node: any) => {
          // Exclude action buttons and non-printable elements
          if (node.classList && node.classList.contains('capture-exclude')) {
            return false;
          }
          return true;
        }
      });
      
      const link = document.createElement('a');
      link.download = `รายงานสวนยาง-${selectedYear+543}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Capture failed:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div ref={reportRef} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-20">
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-4 capture-exclude">
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button 
            onClick={() => setReportTab('season')}
            className={cn("px-6 py-2 rounded-xl text-sm font-bold transition-all", reportTab === 'season' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            สรุปฤดูกาลปัจจุบัน
          </button>
          <button 
            onClick={() => setReportTab('historical')}
            className={cn("px-6 py-2 rounded-xl text-sm font-bold transition-all", reportTab === 'historical' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            เปรียบเทียบหลายฤดูกาล
          </button>
        </div>
      </div>

      {reportTab === 'season' ? (
        <div className="space-y-6 pt-2 pb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-8 rounded-3xl shadow-xl border border-slate-800">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-emerald-400">รายงานรายฤดูกาล</h2>
          <p className="text-slate-400 text-sm mt-1">สรุปภาพรวมฤดูยางพารา: พ.ค. {selectedYear} - เม.ย. {selectedYear + 1}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ปีเริ่มต้น:</span>
            <select 
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent border-none focus:ring-0 text-sm font-black text-white p-0 outline-none"
            >
              {years.map(y => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
            </select>
          </div>
          {user && (
            <button 
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('share', user?.uid || '');
                navigator.clipboard.writeText(url.toString());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className={cn(
                "p-3 rounded-xl transition-all shadow-lg flex items-center gap-2 capture-exclude",
                copied ? "bg-emerald-500 text-white" : "bg-slate-700 text-white hover:bg-slate-600"
              )}
              title="แชร์ลิงก์รายงาน"
            >
              {copied ? (
                <>
                  <CheckCircle size={20} />
                  <span className="text-xs font-bold">คัดลอกแล้ว!</span>
                </>
              ) : <Share2 size={20} />}
            </button>
          )}

          <button 
            onClick={handleCapture}
            disabled={isCapturing}
            className={cn(
              "p-3 rounded-xl transition-all shadow-lg flex items-center gap-2 capture-exclude",
              isCapturing ? "bg-slate-400 text-white" : "bg-blue-600 text-white hover:bg-blue-500"
            )}
            title="บันทึกเป็นรูปภาพ"
          >
            {isCapturing ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : <Camera size={20} />}
          </button>

          <button 
            onClick={() => window.print()}
            className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/50 capture-exclude"
          >
            <Download size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <AnnualStat label="รายรับรวมฤดูกาล" value={seasonData.totalRevenue} color="emerald" icon={<TrendingUp size={24} />} />
        <AnnualStat label="น้ำหนักยางรวม" value={seasonData.totalWeight} color="blue" icon={<Activity size={24} />} unit="กก." />
        <AnnualStat label="จ่ายส่วนแบ่งลูกน้อง" value={seasonData.totalWorkerShare} color="rose" icon={<Users size={24} />} />
        <AnnualStat label="รายจ่ายต้นทุนอื่น" value={seasonData.totalExpenses} color="rose" icon={<TrendingDown size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-slate-800">กำไรสุทธิของคุณ (เจ้าของสวน)</h3>
               <div className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">คำนวณจาก รายรับ - ส่วนแบ่ง - ต้นทุน</div>
            </div>
            
            <div className="flex flex-col md:flex-row items-center gap-12 py-4">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-slate-100" />
                  <circle 
                    cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="16" fill="transparent" 
                    strokeDasharray={552.92} 
                    strokeDashoffset={552.92 * (1 - (seasonData.totalRevenue > 0 ? (seasonData.netProfit / seasonData.totalRevenue) : 0))}
                    className="text-emerald-500 stroke-round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">กำไรสุทธิ</p>
                   <p className="text-2xl font-black text-emerald-600">
                    {seasonData.totalRevenue > 0 ? ((seasonData.netProfit / seasonData.totalRevenue) * 100).toFixed(1) : 0}%
                   </p>
                </div>
              </div>

              <div className="flex-1 space-y-6 w-full">
                <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                   <div>
                     <p className="text-xs font-bold text-slate-400">รายรับหลังจ่ายลูกน้อง</p>
                     <p className="text-xl font-black text-slate-900">฿{formatMoney(seasonData.totalRevenue - seasonData.totalWorkerShare)}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-xs font-bold text-slate-400">ต้นทุนสะสม</p>
                     <p className="text-xl font-black text-rose-500">-฿{formatMoney(seasonData.totalExpenses)}</p>
                   </div>
                </div>

                <div className="bg-emerald-600 p-6 rounded-2xl text-white shadow-xl shadow-emerald-100">
                   <p className="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">เงินกำไรจริง ๆ เข้ากระเป๋า</p>
                   <p className="text-4xl font-black tabular-nums">฿{formatMoney(seasonData.netProfit)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-slate-800">การวิเคราะห์ รายรับ - รายจ่าย รายเดือน</h3>
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-3 py-1 bg-slate-50 rounded-full border border-slate-100">หน่วย: บาท</span>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonData.monthlyAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => val.toLocaleString()} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(value: number) => [value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), ""]}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                  <Bar dataKey="income" name="รายรับ" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="รายจ่ายรวม" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-slate-800">ปริมาณยางแยกตามคนงาน รายเดือน</h3>
               <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">กก.</span>
               </div>
            </div>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonData.monthlyAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip 
                    cursor={{ fill: '#f1f5f9' }}
                    formatter={(value: number) => [Math.round(value).toLocaleString(), "กก."]}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" iconType="circle" />
                  {seasonData.activeWorkers.map((workerName, idx) => {
                    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
                    return (
                      <Bar 
                        key={workerName} 
                        dataKey={workerName} 
                        name={workerName} 
                        stackId="a" 
                        fill={colors[idx % colors.length]} 
                        radius={idx === seasonData.activeWorkers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} 
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-slate-800">สัดส่วนรายจ่ายทั้งหมด</h3>
               <div className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest">คิดเป็นเปอร์เซ็นต์ %</div>
            </div>
            <div className="h-[350px] flex flex-col md:flex-row items-center">
               <div className="flex-1 w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={seasonData.expenseBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {seasonData.expenseBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={['#F43F5E', '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#94A3B8'][index % 6]} />
                        ))}
                      </Pie>
                      <Tooltip 
                         formatter={(value: number) => [`฿${value.toLocaleString()}`, "ยอดเงิน"]}
                         contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
               </div>
               <div className="w-full md:w-64 space-y-3">
                  {seasonData.expenseBreakdown.map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ['#F43F5E', '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#94A3B8'][idx % 6] }} />
                        <span className="text-slate-600 truncate">{item.name}</span>
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">
                        {seasonData.totalExpenses > 0 ? ((item.value / seasonData.totalExpenses) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-lg font-bold text-slate-800">ปริมาณผลผลิตรายเดือน</h3>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 bg-blue-50 text-blue-600 rounded-full">กก.</span>
              </div>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={seasonData.monthlyAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip 
                      cursor={{ fill: '#f0f9ff' }}
                      formatter={(value: number) => [Math.round(value).toLocaleString(), "กก."]}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="weight" name="น้ำหนักยาง" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-lg font-bold text-slate-800">ราคายางเฉลี่ยต่อกิโลกรัม</h3>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 bg-amber-50 text-amber-600 rounded-full">บาท/กก.</span>
              </div>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={seasonData.monthlyAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "฿/กก."]}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="avgPrice" fill="#F59E0B20" stroke="#F59E0B" strokeWidth={3} name="ราคายางเฉลี่ย" dot={{ fill: '#F59E0B', r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col min-h-fit">
           <div className="p-8 border-b bg-slate-50">
              <h4 className="font-bold text-slate-800">สรุปยอดจ่ายลูกน้องรายคน</h4>
              <p className="text-xs text-slate-500 mt-1">ประจำฤดูกาลการผลิตนี้</p>
           </div>
           <div className="divide-y divide-slate-50">
              {Object.entries(seasonData.workerEarnings).length > 0 ? (Object.entries(seasonData.workerEarnings) as [string, number][]).sort((a,b) => b[1] - a[1]).map(([name, amount], idx) => (
                <div key={name} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors min-h-[80px]">
                   <div className="flex items-center gap-4">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm", idx === 0 ? "bg-emerald-500 shadow-lg shadow-emerald-100" : "bg-slate-200 text-slate-500")}>
                         {idx + 1}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-bold text-slate-700">{name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">ส่วนแบ่งสะสม</p>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="font-black text-slate-900">฿{formatMoney(amount as number)}</p>
                      <p className="text-[10px] font-bold text-emerald-500">
                        {seasonData.totalWorkerShare > 0 ? (((amount as number) / seasonData.totalWorkerShare) * 100).toFixed(0) : 0}%
                      </p>
                   </div>
                </div>
              )) : (
                <div className="p-16 text-center text-slate-300 italic text-sm">ไม่มีข้อมูลการจ่ายส่วนแบ่ง</div>
              )}
           </div>
           {Object.entries(seasonData.workerEarnings).length > 0 && (
              <div className="p-6 bg-slate-50/50 border-t border-slate-50">
                 <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
                    <span>รวมยอดจ่ายทั้งหมด</span>
                    <span className="text-slate-900">฿{formatMoney(seasonData.totalWorkerShare)}</span>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  ) : (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
           <div className="mb-8">
              <h3 className="text-2xl font-black text-slate-800">การวิเคราะห์การเงิน</h3>
              <p className="text-slate-500 text-sm mt-1">เปรียบเทียบ รายรับ รายจ่าย และกำไร</p>
           </div>
           
           <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={historicalData} margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <Tooltip 
                       cursor={{ fill: '#f8fafc' }}
                       formatter={(value: number) => [`฿${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, ""]}
                       contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)', padding: '20px' }}
                    />
                    <Legend verticalAlign="top" align="center" iconType="circle" wrapperStyle={{ paddingBottom: '40px' }} />
                    <Bar dataKey="revenue" name="รายรับ" fill="#10B981" radius={[6, 6, 0, 0]} barSize={24} />
                    <Bar dataKey="expense" name="รายจ่ายรวม" fill="#94a3b8" radius={[6, 6, 0, 0]} barSize={24} />
                    <Bar dataKey="profit" name="กำไรสุทธิ" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={24} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
           <div className="mb-8">
              <h3 className="text-2xl font-black text-slate-800">แนวโน้มผลผลิต</h3>
              <p className="text-slate-500 text-sm mt-1">เปรียบเทียบน้ำหนักยางรวมแต่ละฤดูกาล</p>
           </div>
           
           <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={historicalData} margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <Tooltip 
                       cursor={{ fill: '#f8fafc' }}
                       formatter={(value: number) => [`${Math.round(value).toLocaleString()} กก.`, "น้ำหนักยางรวม"]}
                       contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)', padding: '20px' }}
                    />
                    <Legend verticalAlign="top" align="center" iconType="circle" wrapperStyle={{ paddingBottom: '40px' }} />
                    <Bar dataKey="weight" name="น้ำหนักรวม (กก.)" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={32} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
           <div className="mb-8">
              <h3 className="text-2xl font-black text-slate-800">วิเคราะห์ราคาเฉลี่ย</h3>
              <p className="text-slate-500 text-sm mt-1">เปรียบเทียบราคายางเฉลี่ยบาทต่อกิโลกรัม</p>
           </div>
           
           <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={historicalData} margin={{ left: 20, right: 30 }}>
                    <defs>
                       <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                       </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} domain={['auto', 'auto']} />
                    <Tooltip 
                       formatter={(value: number) => [`฿${value.toFixed(2)}/กก.`, "ราคาเฉลี่ย"]}
                       contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)', padding: '20px' }}
                    />
                    <Area type="monotone" dataKey="avgPrice" name="ราคาเฉลี่ย" stroke="#f59e0b" strokeWidth={4} fillOpacity={1} fill="url(#colorPrice)" dot={{ r: 6, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {historicalData.slice().reverse().map((data) => (
           <div key={data.name} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-4">
                 <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black rounded-full uppercase tracking-widest">ฤดูกาล {data.name}</span>
                 <div className={cn("text-xs font-bold", data.profit > 0 ? "text-emerald-500" : "text-rose-500")}>
                    {data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : 0}% กำไร
                 </div>
              </div>
              <div className="space-y-3">
                 <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold uppercase">รายรับ</span>
                    <span className="font-black text-slate-900">฿{formatMoney(data.revenue)}</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold uppercase">รายจ่าย</span>
                    <span className="font-black text-slate-500">฿{formatMoney(data.expense)}</span>
                 </div>
                 <div className="pt-3 border-t flex justify-between items-center">
                    <span className="text-xs text-slate-900 font-black uppercase">กำไรสุทธิ</span>
                    <span className="text-lg font-black text-blue-600">฿{formatMoney(data.profit)}</span>
                 </div>
              </div>
           </div>
         ))}
      </div>
    </div>
  )}
</div>
);
}

function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, title: string, message: string }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full border border-slate-100"
      >
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <Activity size={32} />
        </div>
        <h3 className="text-xl font-black text-slate-900 text-center mb-2">{title}</h3>
        <p className="text-slate-500 text-center text-sm mb-8 leading-relaxed px-4">{message}</p>
        <div className="flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
          >
            ยกเลิก
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-3.5 bg-rose-600 text-white rounded-xl font-bold text-sm hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
          >
            ลบข้อมูล
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AnnualStat({ label, value, color, icon, unit = '฿' }: { label: string, value: number, color: 'emerald' | 'rose' | 'blue', icon: React.ReactNode, unit?: string }) {
  const bgColors = { emerald: 'bg-emerald-50', rose: 'bg-rose-50', blue: 'bg-blue-50' };
  const textColors = { emerald: 'text-emerald-600', rose: 'text-rose-600', blue: 'text-blue-600' };
  
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100", bgColors[color], textColors[color])}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className={cn("text-2xl font-black tabular-nums", textColors[color])}>
          {unit === '฿' ? `฿${formatMoney(value)}` : `${formatWeight(value)} ${unit}`}
        </p>
      </div>
    </div>
  );
}
