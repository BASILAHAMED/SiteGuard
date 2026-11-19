import { useEffect, useState } from 'react';

export interface AbuDhabiClockSnapshot {
  timeWithSeconds: string;
  timeShort: string;
  dateLabel: string;
  hourGst: number;
  minuteGst: number;
  seconds: number;
  inMiddayBanWindow: boolean;
  middayWindowStatusLabel: string;
}

function readAbuDhabiClockSnapshot(): AbuDhabiClockSnapshot {
  const now = new Date();
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  const parts = timeFmt.formatToParts(now);
  const hourGst = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minuteGst = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const seconds = Number(parts.find((p) => p.type === 'second')?.value ?? '0');

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeShort = `${pad(hourGst)}:${pad(minuteGst)}`;
  const timeWithSeconds = `${timeShort}:${pad(seconds)}`;

  const totalMin = hourGst * 60 + minuteGst;
  const banStartMin = 12 * 60 + 30;
  const banEndMin = 15 * 60;
  const inMiddayBanWindow = totalMin >= banStartMin && totalMin < banEndMin;

  let middayWindowStatusLabel = 'Pre-Ban Active';
  if (inMiddayBanWindow) {
    const rem = banEndMin - totalMin;
    middayWindowStatusLabel = `Halt Active (${Math.floor(rem / 60)}h ${rem % 60}m left)`;
  } else if (totalMin >= banEndMin) {
    middayWindowStatusLabel = 'Post-Ban Window';
  } else {
    const wait = banStartMin - totalMin;
    middayWindowStatusLabel = `Ban starts in ${Math.floor(wait / 60)}h ${wait % 60}m`;
  }

  return {
    timeWithSeconds,
    timeShort,
    dateLabel: dateFmt.format(now),
    hourGst,
    minuteGst,
    seconds,
    inMiddayBanWindow,
    middayWindowStatusLabel,
  };
}

export function useAbuDhabiClock(): AbuDhabiClockSnapshot {
  const [snapshot, setSnapshot] = useState<AbuDhabiClockSnapshot>(() =>
    readAbuDhabiClockSnapshot()
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSnapshot(readAbuDhabiClockSnapshot());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return snapshot;
}
