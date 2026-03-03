import React from 'react';
import type { ReactNode } from 'react';

export function CabinetFrame({
  children,
  cabinetImagePath,
}: {
  children: ReactNode;
  cabinetImagePath: string;
}) {
  return (
    <div className="cabinet-frame">
      <div aria-hidden="true" className="cabinet-frame__overlay">
        <img
          alt=""
          aria-hidden="true"
          className="cabinet-frame__image"
          src={cabinetImagePath}
        />
      </div>
      <div aria-hidden="true" className="cabinet-frame__fade" />
      <div className="cabinet-frame__content">
        {children}
      </div>
    </div>
  );
}
