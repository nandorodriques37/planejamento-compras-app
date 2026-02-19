import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

export default function SuccessCheck({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center gap-2"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
      </motion.div>
      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{message}</span>
    </motion.div>
  );
}
