'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

const SLIDES = [
  {
    src: 'https://images.unsplash.com/photo-1687422808384-c896d0efd4ab?w=800&q=80',
    alt: 'Shop owner handing change to a customer in a Nigerian store',
  },
  {
    src: 'https://images.unsplash.com/photo-1687422808311-a776f467a468?w=800&q=80',
    alt: 'Shop owner smiling behind the counter of her store',
  },
  {
    src: 'https://images.unsplash.com/photo-1585540083814-ea6ee8af9e4f?w=800&q=80',
    alt: 'Vendor at a Nigerian market produce stall',
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
    </>
  );
}
