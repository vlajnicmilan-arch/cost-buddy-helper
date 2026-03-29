

## Problem

Na iOS-u (PWA i Capacitor), statusna traka (sat, baterija) prekriva gornji dio aplikacije, pa se ne može pristupiti postavkama i drugim gumbima u headeru.

Aplikacija već ima `padding-top: env(safe-area-inset-top)` na `#root` u `App.css`, i `viewport-fit=cover` u `index.html`, ali `apple-mobile-web-app-status-bar-style` je postavljen na `black-translucent` — što znači da statusna traka prekriva sadržaj umjesto da ga gura dolje.

## Plan

### 1. Promjena status bar stila u `index.html`
Promijeniti `apple-mobile-web-app-status-bar-style` iz `black-translucent` u `default`. To osigurava da iOS PWA dodaje prostor za statusnu traku umjesto da prekriva sadržaj.

### 2. Dodati sigurnosni padding na `body` u `index.css`
Dodati `padding-top: env(safe-area-inset-top)` direktno na `body` element kao fallback, jer neki iOS preglednici ne primjenjuju padding na `#root` dovoljno rano.

### 3. Pojačati safe-area padding na HomeHeader
Dodati eksplicitni `pt-[env(safe-area-inset-top)]` ili fiksni `pt-10` na header komponentu kao dodatnu zaštitu za Capacitor iOS verziju.

## Rezultat
Gornji dio aplikacije (logo, postavke, obavijesti) bit će pomaknut ispod statusne trake na svim iOS uređajima — i u PWA modu i u Capacitor nativnoj verziji.

