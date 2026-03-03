'use client';

import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

const HORROR_CABINET_PATH = '/assets/cabinets/horror-season-1.png';

export function CabinetFrame({
  children,
  cabinetImagePath,
  themeName,
}: {
  children: ReactNode;
  cabinetImagePath: string;
  themeName?: string;
}) {
  const [activeCabinetImagePath, setActiveCabinetImagePath] = useState(cabinetImagePath);
  const frameClassName = useMemo(() => {
    if (themeName === 'cult') {
      return 'cabinet-frame theme-cult';
    }
    return 'cabinet-frame';
  }, [themeName]);

  return (
    <div className={frameClassName}>
      <div aria-hidden="true" className="cabinet-frame__overlay">
        <img
          alt=""
          aria-hidden="true"
          className="cabinet-frame__image"
          onError={() => setActiveCabinetImagePath(HORROR_CABINET_PATH)}
          src={activeCabinetImagePath}
        />
      </div>
      <div aria-hidden="true" className="cabinet-frame__fade" />
      <div className="cabinet-frame__content">
        {children}
      </div>
    </div>
  );
}
