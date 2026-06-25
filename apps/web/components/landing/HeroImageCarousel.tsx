'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

const SLIDES = [
  {
    src: 'https://images.unsplash.com/photo-1687422808384-c896d0efd4ab?w=800&q=80',
    alt: 'Shop owner handing change to a customer in a Nigerian provisions store',
    business: 'FreshMart, Surulere',
    stat: '347 loyal customers',
  },
  {
    src: 'https://images.unsplash.com/photo-1709837167686-a2e33aad1bf0?w=800&q=80',
    alt: 'Baker icing a cake in her home bakery kitchen',
    business: 'Sweet Crumbs Bakery, Yaba',
    stat: '212 loyal customers',
  },
  {
    src: 'https://images.unsplash.com/photo-1761370571873-5d869310d731?w=800&q=80',
    alt: 'Boutique owner arranging clothes on a rack in her shop',
    business: 'Vogue Closet, Abuja',
    stat: '189 loyal customers',
  },
];

export function HeroImageCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {SLIDES.map((slide, i) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          fill
          priority={i === 0}
          className={`object-cover transition-opacity duration-1000 ${
            i === index ? 'opacity-50' : 'opacity-0'
          }`}
        />
      ))}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A1628] via-[#0A1628]/70 to-transparent p-6 pt-20">
        <p className="text-sm text-white/60">{SLIDES[index].business}</p>
        <p className="mt-0.5 font-semibold text-white">{SLIDES[index].stat}</p>
      </div>
    </>
  );
}
