import React from 'react';
import {
  Coins,
  Home,
  ShoppingCart,
  Zap,
  Car,
  GraduationCap,
  Utensils,
  HeartPulse,
  PiggyBank,
  Landmark,
  CreditCard,
  ShieldCheck,
  Tag,
  Briefcase,
  Gift,
  Film,
  Plane,
  Smartphone,
  HelpCircle
} from 'lucide-react';

interface CategoryIconProps {
  name: string;
  className?: string;
  size?: number;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ name, className = 'w-5 h-5', size }) => {
  const norm = name.toLowerCase();

  const props = { className, size };

  if (norm.includes('coin') || norm.includes('payment') || norm.includes('salary') || norm.includes('revenu')) {
    return <Coins {...props} />;
  }
  if (norm.includes('home') || norm.includes('logement') || norm.includes('rent') || norm.includes('loyer')) {
    return <Home {...props} />;
  }
  if (norm.includes('shop') || norm.includes('course') || norm.includes('aliment') || norm.includes('grocer')) {
    return <ShoppingCart {...props} />;
  }
  if (norm.includes('zap') || norm.includes('bolt') || norm.includes('bill') || norm.includes('facture') || norm.includes('energi')) {
    return <Zap {...props} />;
  }
  if (norm.includes('car') || norm.includes('transport') || norm.includes('fuel') || norm.includes('carburant')) {
    return <Car {...props} />;
  }
  if (norm.includes('school') || norm.includes('enfant') || norm.includes('child') || norm.includes('scolarite')) {
    return <GraduationCap {...props} />;
  }
  if (norm.includes('uten') || norm.includes('loisir') || norm.includes('dining') || norm.includes('restaurant') || norm.includes('sorti')) {
    return <Utensils {...props} />;
  }
  if (norm.includes('heart') || norm.includes('medic') || norm.includes('sante') || norm.includes('health') || norm.includes('pharma')) {
    return <HeartPulse {...props} />;
  }
  if (norm.includes('piggy') || norm.includes('saving') || norm.includes('epargne') || norm.includes('invest')) {
    return <PiggyBank {...props} />;
  }
  if (norm.includes('landmark') || norm.includes('bank') || norm.includes('account_balance') || norm.includes('courant')) {
    return <Landmark {...props} />;
  }
  if (norm.includes('credit') || norm.includes('card') || norm.includes('carte')) {
    return <CreditCard {...props} />;
  }
  if (norm.includes('shield') || norm.includes('security') || norm.includes('assurance')) {
    return <ShieldCheck {...props} />;
  }
  if (norm.includes('work') || norm.includes('briefcase') || norm.includes('job')) {
    return <Briefcase {...props} />;
  }
  if (norm.includes('gift') || norm.includes('cadeau')) {
    return <Gift {...props} />;
  }
  if (norm.includes('film') || norm.includes('cinema') || norm.includes('subscrip') || norm.includes('telecom')) {
    return <Film {...props} />;
  }
  if (norm.includes('plane') || norm.includes('travel') || norm.includes('voyage')) {
    return <Plane {...props} />;
  }
  if (norm.includes('phone') || norm.includes('smart') || norm.includes('mobile')) {
    return <Smartphone {...props} />;
  }

  return <Tag {...props} />;
};
