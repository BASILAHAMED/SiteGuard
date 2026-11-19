import type { ReactNode } from 'react';
import { motion } from 'motion/react';

export function PageTransition({
  routeKey,
  children,
}: {
  routeKey: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      key={routeKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedMetric({
  value,
  className = '',
}: {
  value: string | number;
  className?: string;
}) {
  return (
    <motion.span
      key={String(value)}
      initial={{ opacity: 0.55, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`inline-block font-mono tabular-nums ${className}`}
    >
      {value}
    </motion.span>
  );
}
