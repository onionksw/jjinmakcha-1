import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface CountdownProps {
  targetTimeStr: string; // HH:MM
  minutesBefore?: number; // 도보 등 선행 이동 시간 — 이 만큼 일찍 출발해야 함
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

      // Handle crossing midnight
      if (target.getTime() < now.getTime()) {
         if (now.getHours() > 20 && targetHours < 12) {
             target.setDate(target.getDate() + 1);
         }
      }

      // 도보 시간만큼 일찍 출발해야 하므로 남은 시간에서 차감
      const diff = target.getTime() - now.getTime() - minutesBefore * 60000;

      if (diff <= 0) {
        return minutesBefore > 0 ? '지금 출발!' : '곧 출발';
      }

      const minutes = Math.floor((diff / 1000) / 60);
      const seconds = Math.floor((diff / 1000) % 60);
      
      // Urgent if less than 10 minutes
      setIsUrgent(minutes < 10);

      return `${minutes}분 ${seconds}초`;
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    setTimeLeft(calculateTimeLeft()); // Initial call

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