import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface CountdownProps {
  targetTimeStr: string; // HH:MM
  minutesBefore?: number;
}

const Countdown: React.FC<CountdownProps> = ({ targetTimeStr, minutesBefore = 0 }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const [targetHours, targetMinutes] = targetTimeStr.split(':').map(Number);

      const target = new Date();
      target.setHours(targetHours, targetMinutes, 0, 0);

      // 목표 시각이 이미 지났으면: 4시간 이내면 "막차 지남", 4시간 초과면 오늘 밤 막차로 간주해 다음날로
      if (target.getTime() < now.getTime()) {
        const minutesPassed = (now.getTime() - target.getTime()) / 60000;
        if (minutesPassed > 240) {
          target.setDate(target.getDate() + 1);
        }
      }

      const diff = target.getTime() - now.getTime() - minutesBefore * 60000;

      if (diff <= 0) {
        setIsUrgent(true);
        // 목표 시각 자체가 이미 지난 경우 (막차 지남)
        if (target.getTime() <= now.getTime()) return '막차 지남';
        // 목표 시각은 미래이지만 도보 시간이 더 걸림 (지금 당장 출발)
        return '지금 출발!';
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      setIsUrgent(minutes < 10);

      if (hours > 0) return `${hours}시간 ${mins}분`;
      return `${mins}분 ${seconds}초`;
    };

    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    setTimeLeft(calculateTimeLeft());
    return () => clearInterval(timer);
  }, [targetTimeStr, minutesBefore]);

  return (
    <div className={`flex items-center space-x-2 font-mono text-xl font-bold ${isUrgent ? 'text-red-500 animate-pulse' : 'text-brandBlue'}`}>
      <Clock className="w-5 h-5" />
      <span>{timeLeft}</span>
    </div>
  );
};

export default Countdown;
