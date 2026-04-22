import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface Stats {
  totals: { visit: number; search: number; signup: number; taxi: number };
  daily: {
    visit: { date: string; count: number }[];
    search: { date: string; count: number }[];
  };
}

const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className={`rounded-2xl p-5 ${color} flex flex-col gap-1`}>
    <span className="text-sm font-semibold text-gray-600">{label}</span>
    <span className="text-3xl font-black text-gray-800">{value.toLocaleString()}</span>
  </div>
);

const formatDate = (d: string) => d.slice(5); // "MM-DD"

export default function Admin() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async (pw: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin-stats?password=${encodeURIComponent(pw)}`);
      if (res.status === 401) { setError('비밀번호가 틀렸습니다'); setAuthed(false); return; }
      const data: Stats = await res.json();
      setStats(data);
      setAuthed(true);
      setLastUpdated(new Date());
    } catch {
      setError('데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStats(password);
  };

  useEffect(() => {
    if (!authed || !password) return;
    const id = setInterval(() => fetchStats(password), 60_000);
    return () => clearInterval(id);
  }, [authed, password, fetchStats]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
              <span className="text-white text-2xl">🍺</span>
            </div>
            <h1 className="text-2xl font-black text-gray-800">찐막차 어드민</h1>
            <p className="text-gray-400 text-sm mt-1">관리자 전용 페이지입니다</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">아이디</label>
              <input
                type="text"
                defaultValue="master"
                readOnly
                className="w-full mt-1 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full mt-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 font-medium"
                autoFocus
              />
            </div>
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? '확인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-800">찐막차 어드민</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {lastUpdated ? `마지막 업데이트: ${lastUpdated.toLocaleTimeString('ko-KR')}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchStats(password)}
            disabled={loading}
            className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? '새로고침...' : '새로고침'}
          </button>
          <button
            onClick={() => { setAuthed(false); setStats(null); setPassword(''); }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm rounded-xl transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* 핵심 지표 카드 */}
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">전체 누적 통계</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="총 방문자수" value={stats?.totals.visit ?? 0} color="bg-blue-50" />
            <StatCard label="경로 찾기" value={stats?.totals.search ?? 0} color="bg-green-50" />
            <StatCard label="회원가입" value={stats?.totals.signup ?? 0} color="bg-purple-50" />
            <StatCard label="택시 호출" value={stats?.totals.taxi ?? 0} color="bg-orange-50" />
          </div>
        </div>

        {/* 일별 방문자 차트 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">최근 7일 방문자</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={(stats?.daily.visit ?? []).map(d => ({ ...d, date: formatDate(d.date) }))}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 13 }}
                cursor={{ fill: '#eff6ff' }}
              />
              <Bar dataKey="count" name="방문자" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 일별 경로찾기 차트 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">최근 7일 경로 찾기</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={(stats?.daily.search ?? []).map(d => ({ ...d, date: formatDate(d.date) }))}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 13 }}
                cursor={{ fill: '#f0fdf4' }}
              />
              <Bar dataKey="count" name="경로 찾기" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-center text-xs text-gray-300 pb-4">찐막차 Admin · 데이터는 Vercel KV에 저장됩니다</p>
      </div>
    </div>
  );
}
