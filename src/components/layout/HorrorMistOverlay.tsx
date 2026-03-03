import React from 'react';

export function shouldRenderHorrorMist(themeName: string): boolean {
  return themeName === 'horror';
}

export function HorrorMistOverlay({ themeName }: { themeName: string }) {
  if (!shouldRenderHorrorMist(themeName)) {
    return null;
  }

  return (
    <div aria-hidden="true" className="horror-mist-overlay">
      <div className="horror-mist-overlay__layer horror-mist-overlay__layer--left" />
      <div className="horror-mist-overlay__layer horror-mist-overlay__layer--right" />
      <div className="horror-mist-overlay__layer horror-mist-overlay__layer--center" />
      <div className="horror-mist-overlay__layer horror-mist-overlay__layer--edge-left" />
      <div className="horror-mist-overlay__layer horror-mist-overlay__layer--edge-right" />
      <div className="horror-mist-overlay__bloom horror-mist-overlay__bloom--left" />
      <div className="horror-mist-overlay__bloom horror-mist-overlay__bloom--right" />
    </div>
  );
}
