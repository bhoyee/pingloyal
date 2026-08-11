'use client';
import { useEffect } from 'react';
import Image from 'next/image';

export interface HeroSlide {
  src: string;
  alt: string;
  business: string;
  stat: string;
  revenue: string;
  revenueChange: string;
  customerName: string;
  pointsEarned: number;
  pointsNeeded: number;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    src: 'https://images.unsplash.com/photo-1687422808384-c896d0efd4ab?w=900&q=90',
    alt: 'Shop owner handing change to a customer in a Nigerian provisions store',
    business: 'FreshMart, Surulere',
    stat: '347 loyal customers',
    revenue: '₦1.2M',
    revenueChange: '↑ 34%',
    customerName: 'Amaka',
    pointsEarned: 50,
    pointsNeeded: 30,
  },
  {
    src: 'https://images.unsplash.com/photo-1709837167686-a2e33aad1bf0?w=900&q=90',
    alt: 'Baker icing a cake in her home bakery kitchen',
    business: 'Sweet Crumbs Bakery, Yaba',
    stat: '212 loyal customers',
    revenue: '₦680K',
    revenueChange: '↑ 22%',
    customerName: 'Tunde',
    pointsEarned: 80,
    pointsNeeded: 20,
  },
  {
    src: 'https://images.unsplash.com/photo-1761373564177-8505a38c91f2?w=900&q=90',
    alt: 'Customer relaxing in the chair at a hair salon',
    business: 'Glow Hair Studio, Lekki',
    stat: '164 loyal customers',
    revenue: '₦420K',
    revenueChange: '↑ 18%',
    customerName: 'Chioma',
    pointsEarned: 120,
    pointsNeeded: 30,
  },
  {
    src: 'https://images.unsplash.com/photo-1742134516280-d62ad935b951?w=900&q=90',
    alt: 'Customers seated and dining at a restaurant table',
    business: 'Spice Route, Victoria Island',
    stat: '198 loyal customers',
    revenue: '₦950K',
    revenueChange: '↑ 28%',
    customerName: 'Fatima',
    pointsEarned: 60,
    pointsNeeded: 40,
  },
];

interface Props {
  index: number;
  onIndexChange: (value: number | ((prev: number) => number)) => void;
}

export function HeroImageCarousel({ index, onIndexChange }: Props) {
  useEffect(() => {
    const id = setInterval(() => {
      onIndexChange((i: number) => (i + 1) % HERO_SLIDES.length);
    }, 4000);
    return () => clearInterval(id);
  }, [onIndexChange]);

  return (
    <>
      {HERO_SLIDES.map((slide, i) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          fill
          priority={i === 0}
          className={`object-cover transition-opacity duration-1000 ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A1628] via-[#0A1628]/50 to-transparent p-6 pt-20">
        <p className="text-sm text-white/70">{HERO_SLIDES[index].business}</p>
        <p className="mt-0.5 font-semibold text-white">{HERO_SLIDES[index].stat}</p>
      </div>
    </>
  );
}
