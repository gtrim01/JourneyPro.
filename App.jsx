import { useState, useMemo, useEffect, useRef } from "react";
import { AlertTriangle, Fuel, Caravan, Route, Info, X, Plus, Clock, ChevronDown, ExternalLink, CloudSun, Wind, Loader2, Map as MapIcon, Compass } from "lucide-react";

/* On the real web there's no preview storage API — back the same interface
   with the browser's localStorage so saved trips keep working. */
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem("jp:" + key);
      if (v === null) throw new Error("not found");
      return { key, value: v };
    },
    async set(key, value) { localStorage.setItem("jp:" + key, value); return { key, value }; },
    async delete(key) { localStorage.removeItem("jp:" + key); return { key, deleted: true }; },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("jp:" + prefix)) keys.push(k.slice(3));
      }
      return { keys, prefix };
    },
  };
}

/* ============================================================
   JourneyPro — Prototype v0.30 (true offline)
   · The Nullarbor promise: after one online visit, the whole
     app — plans, 235 stop guides, Travel Mode, journal,
     scratch map, and any map tiles you've already seen —
     works with zero bars
   · Online behaviour is unchanged: updates still arrive
     instantly; the cache refreshes quietly behind each visit
   · A gentle 📡 strip appears when you're offline; live
     prices, weather and road reports return with reception
   · Plus everything from v0.29
   Curated prototype dataset — figures are realistic estimates
   ============================================================ */

const STAY_RATES = {
  free:   { label: "Mostly free camps",    rate: 10 },
  mix:    { label: "Mix of camps & parks", rate: 30 },
  parks:  { label: "Caravan parks",        rate: 48 },
  cabins: { label: "Cabins & motels",      rate: 130 },
};

const FUEL_META = {
  diesel: { label: "Diesel",      defaultPrice: 2.05 },
  u91:    { label: "Unleaded 91", defaultPrice: 1.9 },
  p95:    { label: "Premium 95",  defaultPrice: 2.1 },
};

/* ---------- Tow vehicles: make → model → variants ---------- */
const VEHICLE_DATA = [
  { make: "Toyota", models: [
    { model: "HiLux", variants: [
      { v: "2.8 Turbo-Diesel 4×4", yr: "2015–now", fuel: "diesel", tank: 80, real: 9.5, tow: 3500, kerb: 2110, gvm: 3050, ball: 350 },
      { v: "2.4 Turbo-Diesel 4×4", yr: "2015–now", fuel: "diesel", tank: 80, real: 9, tow: 3200, kerb: 2050, gvm: 3000, ball: 350 },
    ]},
    { model: "LandCruiser 300", variants: [
      { v: "3.3 V6 Turbo-Diesel", yr: "2021–now", fuel: "diesel", tank: 110, real: 11.2, tow: 3500, kerb: 2560, gvm: 3280, ball: 350 },
    ]},
    { model: "LandCruiser 200", variants: [
      { v: "4.5 V8 Turbo-Diesel", yr: "2007–21", fuel: "diesel", tank: 138, real: 13.5, tow: 3500, kerb: 2740, gvm: 3350, ball: 350 },
    ]},
    { model: "LandCruiser 70 Series", variants: [
      { v: "4.5 V8 Turbo-Diesel", yr: "2007–now", fuel: "diesel", tank: 130, real: 12.8, tow: 3500, kerb: 2270, gvm: 3400, ball: 350 },
      { v: "2.8 Turbo-Diesel auto", yr: "2023–now", fuel: "diesel", tank: 130, real: 10.5, tow: 3500, kerb: 2325, gvm: 3510, ball: 350 },
    ]},
    { model: "Prado", variants: [
      { v: "2.8 TD (150, twin tank)", yr: "2015–23", fuel: "diesel", tank: 150, real: 10.2, tow: 3000, kerb: 2455, gvm: 2990, ball: 300 },
      { v: "2.8 TD (250 series)", yr: "2024–now", fuel: "diesel", tank: 110, real: 10, tow: 3500, kerb: 2520, gvm: 3100, ball: 350 },
    ]},
    { model: "Fortuner", variants: [
      { v: "2.8 Turbo-Diesel", yr: "2015–now", fuel: "diesel", tank: 80, real: 9.8, tow: 3100, kerb: 2185, gvm: 2800, ball: 300 },
    ]},
    { model: "Kluger", variants: [
      { v: "2.4 Turbo petrol", yr: "2021–now", fuel: "u91", tank: 68, real: 10.8, tow: 2000, kerb: 2050, gvm: 2800, ball: 200 },
      { v: "2.5 Hybrid AWD", yr: "2021–now", fuel: "u91", tank: 65, real: 6.9, tow: 2000, kerb: 2050, gvm: 2800, ball: 200 },
    ]},
    { model: "LandCruiser 100", variants: [
      { v: "4.2 Turbo-Diesel", yr: "1998–2007", fuel: "diesel", tank: 145, real: 12.8, tow: 3500, kerb: 2450, gvm: 3260, ball: 350 },
    ]},
    { model: "Tundra", variants: [
      { v: "3.4 V6 Hybrid i-Force Max", yr: "2024–now", fuel: "u91", tank: 122, real: 13.5, tow: 4500, kerb: 2775, gvm: 3530, ball: 450 },
    ]},
    { model: "RAV4", variants: [
      { v: "2.5 Hybrid AWD", yr: "2019–now", fuel: "u91", tank: 55, real: 6.3, tow: 1500, kerb: 1745, gvm: 2270, ball: 150 },
    ]},
    { model: "HiAce", variants: [
      { v: "2.8 Turbo-Diesel", yr: "2019–now", fuel: "diesel", tank: 70, real: 10.2, tow: 1900 },
    ]},
  ]},
  { make: "Ford", models: [
    { model: "Ranger", variants: [
      { v: "2.0 Bi-Turbo Diesel", yr: "2022–now", fuel: "diesel", tank: 80, real: 9.4, tow: 3500, kerb: 2250, gvm: 3230, ball: 350 },
      { v: "3.0 V6 Turbo-Diesel", yr: "2022–now", fuel: "diesel", tank: 80, real: 10.4, tow: 3500, kerb: 2350, gvm: 3350, ball: 350 },
      { v: "3.2 Turbo-Diesel (PX)", yr: "2011–22", fuel: "diesel", tank: 80, real: 10, tow: 3500 },
      { v: "Raptor 3.0 TT petrol", yr: "2022–now", fuel: "p95", tank: 80, real: 13.5, tow: 2500, kerb: 2350, gvm: 3350, ball: 350 },
    ]},
    { model: "Everest", variants: [
      { v: "3.0 V6 Turbo-Diesel", yr: "2022–now", fuel: "diesel", tank: 80, real: 10.6, tow: 3500, kerb: 2450, gvm: 3150, ball: 350 },
      { v: "2.0 Bi-Turbo Diesel", yr: "2022–now", fuel: "diesel", tank: 80, real: 9.8, tow: 3500, kerb: 2410, gvm: 3100, ball: 350 },
    ]},
    { model: "F-150", variants: [
      { v: "3.5 EcoBoost V6", yr: "2023–now", fuel: "u91", tank: 136, real: 14.5, tow: 4500, kerb: 2555, gvm: 3265, ball: 450 },
    ]},
    { model: "Territory", variants: [
      { v: "2.7 Turbo-Diesel", yr: "2011–16", fuel: "diesel", tank: 75, real: 10, tow: 2700, kerb: 2110, gvm: 2720, ball: 270 },
    ]},
    { model: "Falcon", variants: [
      { v: "4.0 XR6 (FG)", yr: "2008–16", fuel: "u91", tank: 68, real: 11.2, tow: 2300 },
    ]},
    { model: "Transit", variants: [
      { v: "2.0 TD (van / motorhome base)", yr: "2014–now", fuel: "diesel", tank: 80, real: 11.5, tow: 2500 },
    ]},
  ]},
  { make: "Isuzu", models: [
    { model: "D-MAX", variants: [
      { v: "3.0 Turbo-Diesel", yr: "2020–now", fuel: "diesel", tank: 76, real: 9.6, tow: 3500, kerb: 2100, gvm: 3100, ball: 350 },
      { v: "1.9 Turbo-Diesel", yr: "2023–now", fuel: "diesel", tank: 76, real: 8.6, tow: 3000, kerb: 2100, gvm: 3100, ball: 350 },
    ]},
    { model: "MU-X", variants: [
      { v: "3.0 Turbo-Diesel", yr: "2021–now", fuel: "diesel", tank: 80, real: 9.9, tow: 3500, kerb: 2205, gvm: 3000, ball: 350 },
    ]},
  ]},
  { make: "Mazda", models: [
    { model: "BT-50", variants: [
      { v: "3.0 Turbo-Diesel", yr: "2020–now", fuel: "diesel", tank: 76, real: 9.6, tow: 3500, kerb: 2115, gvm: 3100, ball: 350 },
    ]},
    { model: "CX-5", variants: [
      { v: "2.5 Turbo petrol AWD", yr: "2018–now", fuel: "u91", tank: 58, real: 9.2, tow: 2000 },
    ]},
    { model: "CX-8", variants: [
      { v: "2.2 Twin-Turbo Diesel", yr: "2018–23", fuel: "diesel", tank: 74, real: 7.6, tow: 2000 },
    ]},
    { model: "CX-9", variants: [
      { v: "2.5 Turbo petrol", yr: "2016–23", fuel: "u91", tank: 74, real: 10.2, tow: 2000 },
    ]},
    { model: "CX-60", variants: [
      { v: "3.3 Turbo-Diesel 48V", yr: "2023–now", fuel: "diesel", tank: 58, real: 7.9, tow: 2500 },
    ]},
  ]},
  { make: "Mitsubishi", models: [
    { model: "Triton", variants: [
      { v: "2.4 Bi-Turbo Diesel", yr: "2024–now", fuel: "diesel", tank: 75, real: 9, tow: 3500, kerb: 1995, gvm: 2900, ball: 310 },
      { v: "2.4 Turbo-Diesel", yr: "2015–24", fuel: "diesel", tank: 75, real: 9.3, tow: 3100, kerb: 1995, gvm: 2900, ball: 310 },
    ]},
    { model: "Pajero Sport", variants: [
      { v: "2.4 Turbo-Diesel", yr: "2016–now", fuel: "diesel", tank: 68, real: 9.8, tow: 3100, kerb: 2105, gvm: 2775, ball: 310 },
      { v: "2.4 Turbo-Diesel", yr: "2015–now", fuel: "diesel", tank: 68, real: 9, tow: 3100, kerb: 2105, gvm: 2775, ball: 310 },
    ]},
    { model: "Pajero", variants: [
      { v: "3.2 Turbo-Diesel (NX)", yr: "2015–21", fuel: "diesel", tank: 88, real: 11, tow: 3000, kerb: 2320, gvm: 2810 },
      { v: "3.2 Turbo-Diesel", yr: "2006–21", fuel: "diesel", tank: 88, real: 10.8, tow: 3000, kerb: 2320, gvm: 2810 },
    ]},
    { model: "Outlander", variants: [
      { v: "2.5 AWD", yr: "2021–now", fuel: "u91", tank: 55, real: 8.6, tow: 1600 },
    ]},
  ]},
  { make: "Nissan", models: [
    { model: "Navara", variants: [
      { v: "2.3 Twin-Turbo Diesel", yr: "2015–now", fuel: "diesel", tank: 80, real: 9.2, tow: 3500, kerb: 2170, gvm: 3150, ball: 300 },
    ]},
    { model: "Patrol", variants: [
      { v: "Y62 5.6 V8 petrol", yr: "2013–now", fuel: "p95", tank: 140, real: 16.5, tow: 3500 },
    ]},
    { model: "Patrol Y62", variants: [
      { v: "5.6 V8 petrol", yr: "2013–now", fuel: "p95", tank: 140, real: 15.5, tow: 3500, kerb: 2812, gvm: 3620, ball: 350 },
    ]},
    { model: "Patrol GU", variants: [
      { v: "4.2 Turbo-Diesel", yr: "1998–2007", fuel: "diesel", tank: 95, real: 12.8, tow: 3500, kerb: 2400, ball: 350 },
    ]},
    { model: "Pathfinder", variants: [
      { v: "3.5 V6 AWD", yr: "2022–now", fuel: "u91", tank: 71, real: 11, tow: 2700 },
    ]},
    { model: "X-Trail", variants: [
      { v: "2.5 AWD", yr: "2022–now", fuel: "u91", tank: 55, real: 8.4, tow: 2000 },
    ]},
  ]},
  { make: "Volkswagen", models: [
    { model: "Amarok", variants: [
      { v: "3.0 V6 TDI", yr: "2023–now", fuel: "diesel", tank: 80, real: 10.8, tow: 3500, kerb: 2270, gvm: 3170, ball: 300 },
      { v: "2.0 Bi-Turbo TDI", yr: "2023–now", fuel: "diesel", tank: 80, real: 9.5, tow: 3500, kerb: 2270, gvm: 3170, ball: 300 },
      { v: "3.0 V6 TDI 580", yr: "2017–22", fuel: "diesel", tank: 80, real: 11, tow: 3500, kerb: 2270, gvm: 3170, ball: 300 },
    ]},
    { model: "Touareg", variants: [
      { v: "3.0 V6 TDI", yr: "2019–now", fuel: "diesel", tank: 90, real: 9.8, tow: 3500, kerb: 2155, gvm: 2900, ball: 280 },
      { v: "3.0 V6 Turbo-Diesel", yr: "2019–now", fuel: "diesel", tank: 90, real: 9.2, tow: 3500, kerb: 2155, gvm: 2900, ball: 280 },
    ]},
    { model: "Transporter", variants: [
      { v: "2.0 BiTDI 4Motion", yr: "2016–now", fuel: "diesel", tank: 80, real: 9.8, tow: 3000 },
    ]},
    { model: "Crafter", variants: [
      { v: "2.0 TDI (van / motorhome base)", yr: "2018–now", fuel: "diesel", tank: 75, real: 11, tow: 3000 },
    ]},
  ]},
  { make: "GWM", models: [
    { model: "Cannon", variants: [
      { v: "2.0 Turbo-Diesel", yr: "2020–now", fuel: "diesel", tank: 78, real: 10.5, tow: 3000 },
    ]},
    { model: "Tank 300", variants: [
      { v: "2.0 Turbo petrol", yr: "2023–now", fuel: "u91", tank: 75, real: 11.8, tow: 2500 },
    ]},
    { model: "Cannon Alpha", variants: [
      { v: "2.4 Turbo-Diesel", yr: "2024–now", fuel: "diesel", tank: 78, real: 9.6, tow: 3500 },
    ]},
    { model: "Tank 500", variants: [
      { v: "2.0 Turbo Hybrid", yr: "2024–now", fuel: "u91", tank: 80, real: 10.4, tow: 3500 },
    ]},
  ]},
  { make: "LDV", models: [
    { model: "T60 Max", variants: [
      { v: "2.0 Bi-Turbo Diesel", yr: "2021–now", fuel: "diesel", tank: 73, real: 10.6, tow: 3000 },
    ]},
    { model: "Deliver 9", variants: [
      { v: "2.0 TD (van / motorhome base)", yr: "2020–now", fuel: "diesel", tank: 80, real: 11.8, tow: 2500 },
    ]},
  ]},
  { make: "Jeep", models: [
    { model: "Grand Cherokee", variants: [
      { v: "3.0 CRD Diesel", yr: "2013–21", fuel: "diesel", tank: 93, real: 10.5, tow: 3500, kerb: 2270, gvm: 2949, ball: 350 },
    ]},
    { model: "Gladiator", variants: [
      { v: "3.6 V6 petrol", yr: "2020–now", fuel: "u91", tank: 83, real: 12.6, tow: 2721 },
    ]},
    { model: "Wrangler", variants: [
      { v: "3.6 V6 Unlimited", yr: "2019–now", fuel: "u91", tank: 81, real: 11.8, tow: 2495 },
    ]},
  ]},
  { make: "Land Rover", models: [
    { model: "Defender 110", variants: [
      { v: "D300 Diesel", yr: "2020–now", fuel: "diesel", tank: 89, real: 10.4, tow: 3500, kerb: 2361, gvm: 3165, ball: 350 },
      { v: "D300 3.0 Turbo-Diesel", yr: "2020–now", fuel: "diesel", tank: 89, real: 9.9, tow: 3500, kerb: 2361, gvm: 3165, ball: 350 },
    ]},
    { model: "Discovery", variants: [
      { v: "D300 Diesel", yr: "2021–now", fuel: "diesel", tank: 85, real: 10.2, tow: 3500, kerb: 2358, gvm: 3130, ball: 350 },
      { v: "D300 3.0 Turbo-Diesel", yr: "2021–now", fuel: "diesel", tank: 90, real: 9.6, tow: 3500, kerb: 2358, gvm: 3130, ball: 350 },
    ]},
  ]},
  { make: "RAM", models: [
    { model: "1500", variants: [
      { v: "5.7 V8 petrol", yr: "2018–now", fuel: "u91", tank: 98, real: 14.8, tow: 4500, kerb: 2650, gvm: 3450, ball: 450 },
      { v: "5.7 V8 Hemi", yr: "2018–now", fuel: "u91", tank: 98, real: 14.5, tow: 4500, kerb: 2650, gvm: 3450, ball: 450 },
    ]},
    { model: "2500", variants: [
      { v: "6.7 Cummins Turbo-Diesel", yr: "2018–now", fuel: "diesel", tank: 117, real: 15.8, tow: 4500, kerb: 3525, gvm: 4495, ball: 450 },
    ]},
  ]},
  { make: "Chevrolet", models: [
    { model: "Silverado 1500", variants: [
      { v: "6.2 V8 petrol", yr: "2021–now", fuel: "p95", tank: 91, real: 15.5, tow: 4500, kerb: 2540, gvm: 3300, ball: 450 },
    ]},
    { model: "Silverado 2500HD", variants: [
      { v: "6.6 Duramax Turbo-Diesel", yr: "2021–now", fuel: "diesel", tank: 136, real: 16, tow: 4500, kerb: 3700, gvm: 4500, ball: 450 },
    ]},
  ]},
  { make: "Kia", models: [
    { model: "Tasman", variants: [
      { v: "2.2 Turbo-Diesel", yr: "2025–now", fuel: "diesel", tank: 80, real: 9.6, tow: 3500, kerb: 2242, gvm: 3250, ball: 350 },
    ]},
    { model: "Sorento", variants: [
      { v: "2.2 Turbo-Diesel", yr: "2020–now", fuel: "diesel", tank: 67, real: 8.6, tow: 2500 },
      { v: "2.2 Turbo-Diesel AWD", yr: "2020–now", fuel: "diesel", tank: 67, real: 7.8, tow: 2000 },
    ]},
    { model: "Carnival", variants: [
      { v: "2.2 Turbo-Diesel", yr: "2021–now", fuel: "diesel", tank: 72, real: 8.4, tow: 2000 },
    ]},
  ]},
  { make: "Hyundai", models: [
    { model: "Santa Fe", variants: [
      { v: "2.2 Turbo-Diesel", yr: "2018–23", fuel: "diesel", tank: 67, real: 8.5, tow: 2500 },
      { v: "2.2 Turbo-Diesel AWD", yr: "2018–23", fuel: "diesel", tank: 67, real: 7.9, tow: 2500 },
    ]},
    { model: "Palisade", variants: [
      { v: "2.2 Turbo-Diesel AWD", yr: "2021–now", fuel: "diesel", tank: 71, real: 8.6, tow: 2200 },
    ]},
    { model: "Tucson", variants: [
      { v: "2.0 Turbo-Diesel AWD", yr: "2021–now", fuel: "diesel", tank: 54, real: 7.8, tow: 1900 },
    ]},
  ]},
  { make: "GMC", models: [
    { model: "Sierra 1500", variants: [
      { v: "6.2 V8 petrol", yr: "2023–now", fuel: "p95", tank: 91, real: 13.9, tow: 4500, kerb: 2540, gvm: 3300, ball: 450 },
    ]},
    { model: "Sierra 2500HD", variants: [
      { v: "6.6 Duramax Turbo-Diesel", yr: "2024–now", fuel: "diesel", tank: 136, real: 16, tow: 4500, kerb: 3700, gvm: 4500, ball: 450 },
    ]},
  ]},
  { make: "Holden", models: [
    { model: "Colorado", variants: [
      { v: "2.8 Duramax Turbo-Diesel", yr: "2012–20", fuel: "diesel", tank: 76, real: 9.8, tow: 3500, kerb: 2100, gvm: 3150, ball: 350 },
    ]},
    { model: "Trailblazer", variants: [
      { v: "2.8 Turbo-Diesel", yr: "2016–20", fuel: "diesel", tank: 76, real: 9.6, tow: 3000, kerb: 2203, gvm: 2900, ball: 300 },
    ]},
    { model: "Commodore", variants: [
      { v: "3.6 SV6 (VE/VF)", yr: "2006–17", fuel: "u91", tank: 71, real: 11.5, tow: 2100 },
      { v: "6.0 V8 SS (VE/VF)", yr: "2006–17", fuel: "u91", tank: 71, real: 13, tow: 2100 },
    ]},
  ]},
  { make: "Subaru", models: [
    { model: "Outback", variants: [
      { v: "2.5 AWD", yr: "2021–now", fuel: "u91", tank: 63, real: 8.8, tow: 2000 },
      { v: "2.4 XT Turbo", yr: "2023–now", fuel: "u91", tank: 63, real: 9.6, tow: 2400 },
    ]},
    { model: "Forester", variants: [
      { v: "2.5 AWD", yr: "2019–now", fuel: "u91", tank: 63, real: 8.5, tow: 1800 },
    ]},
  ]},
  { make: "SsangYong", models: [
    { model: "Musso", variants: [
      { v: "2.2 Turbo-Diesel", yr: "2018–now", fuel: "diesel", tank: 75, real: 9.2, tow: 3500 },
    ]},
    { model: "Rexton", variants: [
      { v: "2.2 Turbo-Diesel", yr: "2018–now", fuel: "diesel", tank: 70, real: 9.4, tow: 3500 },
    ]},
  ]},
  { make: "Mercedes-Benz", models: [
    { model: "GLE", variants: [
      { v: "300d 2.0 Turbo-Diesel", yr: "2019–now", fuel: "diesel", tank: 85, real: 8.8, tow: 2700 },
      { v: "400d 3.0 Turbo-Diesel", yr: "2019–now", fuel: "diesel", tank: 85, real: 9.4, tow: 3500, kerb: 2320, gvm: 3050, ball: 350 },
    ]},
    { model: "Sprinter", variants: [
      { v: "2.0 CDI (van / motorhome base)", yr: "2019–now", fuel: "diesel", tank: 93, real: 12, tow: 2000 },
    ]},
  ]},
  { make: "Fiat", models: [
    { model: "Ducato", variants: [
      { v: "Multijet 180 (van / motorhome base)", yr: "2014–now", fuel: "diesel", tank: 90, real: 12.5, tow: 2000 },
    ]},
  ]},
  { make: "Iveco", models: [
    { model: "Daily", variants: [
      { v: "3.0 TD (van / motorhome base)", yr: "2016–now", fuel: "diesel", tank: 100, real: 13, tow: 3500 },
    ]},
  ]},
  { make: "Renault", models: [
    { model: "Master", variants: [
      { v: "2.3 TD (van / motorhome base)", yr: "2015–now", fuel: "diesel", tank: 80, real: 11.8, tow: 2500 },
    ]},
  ]},
  { make: "BYD", models: [
    { model: "Shark 6", variants: [
      { v: "1.5 Turbo PHEV", yr: "2025–now", fuel: "u91", tank: 60, real: 8.5, tow: 2500 },
    ]},
  ]},
  { make: "Mahindra", models: [
    { model: "Pik-Up", variants: [
      { v: "2.2 Turbo-Diesel S11", yr: "2020–now", fuel: "diesel", tank: 80, real: 9.5, tow: 2500 },
    ]},
  ]},
  { make: "Skoda", models: [
    { model: "Kodiaq", variants: [
      { v: "2.0 TSI AWD", yr: "2017–now", fuel: "u91", tank: 58, real: 9, tow: 2300 },
    ]},
  ]},
  { make: "Winnebago", models: [
    { model: "Burleigh", variants: [
      { v: "C-class (Iveco Daily base)", yr: "2018–now", fuel: "diesel", tank: 100, real: 14.5, tow: 2000 },
    ]},
    { model: "Coogee", variants: [
      { v: "C-class (Iveco Daily base)", yr: "2018–now", fuel: "diesel", tank: 100, real: 14, tow: 2000 },
    ]},
  ]},
  { make: "Avida", models: [
    { model: "Birdsville", variants: [
      { v: "C7434 (Iveco Daily base)", yr: "2016–now", fuel: "diesel", tank: 100, real: 14.5, tow: 2000 },
    ]},
    { model: "Busselton", variants: [
      { v: "B7944 (Iveco Daily base)", yr: "2016–now", fuel: "diesel", tank: 100, real: 15, tow: 1500 },
    ]},
  ]},
  { make: "Sunliner", models: [
    { model: "Habitat", variants: [
      { v: "H495 (Fiat Ducato base)", yr: "2017–now", fuel: "diesel", tank: 90, real: 13, tow: 2000 },
    ]},
    { model: "Switch", variants: [
      { v: "S541 (Fiat Ducato base)", yr: "2017–now", fuel: "diesel", tank: 90, real: 12.8, tow: 2000 },
    ]},
  ]},
  { make: "Horizon", models: [
    { model: "Wattle", variants: [
      { v: "(Mercedes Sprinter base)", yr: "2018–now", fuel: "diesel", tank: 93, real: 11.8, tow: 2000 },
    ]},
    { model: "Banksia", variants: [
      { v: "(VW Crafter base)", yr: "2018–now", fuel: "diesel", tank: 75, real: 11.5, tow: 2000 },
    ]},
  ]},
  { make: "Trakka", models: [
    { model: "Torino", variants: [
      { v: "(Fiat Ducato base)", yr: "2016–now", fuel: "diesel", tank: 90, real: 11.8, tow: 2000 },
    ]},
    { model: "Jabiru", variants: [
      { v: "(Mercedes Sprinter base)", yr: "2016–now", fuel: "diesel", tank: 93, real: 11.5, tow: 2000 },
    ]},
  ]},
  { make: "Jayco (motorhome)", models: [
    { model: "Conquest", variants: [
      { v: "(Fiat Ducato base)", yr: "2015–now", fuel: "diesel", tank: 90, real: 13.5, tow: 2000 },
    ]},
    { model: "Optimum", variants: [
      { v: "(Iveco Daily base)", yr: "2016–now", fuel: "diesel", tank: 100, real: 14.5, tow: 2500 },
    ]},
  ]},
  { make: "Paradise", models: [
    { model: "Independence", variants: [
      { v: "(Iveco Daily base)", yr: "2016–now", fuel: "diesel", tank: 100, real: 15.5, tow: 2000 },
    ]},
  ]},
  { make: "Frontline", models: [
    { model: "Adventurer", variants: [
      { v: "campervan (VW Transporter base)", yr: "2016–now", fuel: "diesel", tank: 80, real: 10.5, tow: 1500 },
    ]},
  ]},
  { make: "Talvor", models: [
    { model: "Murana", variants: [
      { v: "campervan (Toyota HiAce base)", yr: "2016–now", fuel: "diesel", tank: 70, real: 11, tow: 1400 },
    ]},
  ]},
];
const VEHICLE_VARIANT_COUNT = VEHICLE_DATA.reduce((a, mk) => a + mk.models.reduce((b, mo) => b + mo.variants.length, 0), 0);
/* A→Z menu order; physical indexes untouched so saved trips stay valid */
const MAKE_ORDER = VEHICLE_DATA.map((_, i) => i).sort((a, b) => VEHICLE_DATA[a].make.localeCompare(VEHICLE_DATA[b].make));
const MODEL_ORDER = VEHICLE_DATA.map((mk) => mk.models.map((_, i) => i).sort((a, b) => mk.models[a].model.localeCompare(mk.models[b].model)));

/* ---------- Caravans & campers ---------- */
const VAN_DATA = [
  { make: "Jayco", models: [
    { m: "Swan Camper", style: "camper", len: 14, tare: 1150, atm: 1450 },
    { m: "Journey Pop-Top 17", style: "pop", len: 17, tare: 1650, atm: 2100 },
    { m: "Expanda 16", style: "pop", len: 16, tare: 1750, atm: 2250 },
    { m: "Starcraft 19", style: "full", len: 19, tare: 2200, atm: 2800 },
    { m: "All-Terrain 19", style: "off", len: 19, tare: 2500, atm: 3100 },
    { m: "Silverline 21", style: "full", len: 21, tare: 2900, atm: 3300 },
    { m: "Eagle Camper", style: "camper", len: 14, tare: 1250, atm: 1550 },
    { m: "CrossTrak 13", style: "off", len: 13, tare: 1680, atm: 2100 },
  ]},
  { make: "New Age", models: [
    { m: "Oz Classic 18", style: "full", len: 18, tare: 2100, atm: 2800 },
    { m: "Manta Ray 20", style: "full", len: 20, tare: 2400, atm: 3000 },
  ]},
  { make: "Coromal", models: [
    { m: "Appeal 18", style: "full", len: 18, tare: 2050, atm: 2600 },
  ]},
  { make: "Windsor", models: [
    { m: "Genesis 19", style: "full", len: 19, tare: 2200, atm: 2800 },
  ]},
  { make: "Retreat", models: [
    { m: "Brampton 21", style: "full", len: 21, tare: 2500, atm: 3200 },
  ]},
  { make: "Crusader", models: [
    { m: "Musketeer 19", style: "full", len: 19, tare: 2300, atm: 2950 },
  ]},
  { make: "Lotus", models: [
    { m: "Trooper 21 (off-road)", style: "off", len: 21, tare: 2800, atm: 3500 },
  ]},
  { make: "Zone RV", models: [
    { m: "Summit 19 (off-road)", style: "off", len: 19, tare: 2600, atm: 3300 },
  ]},
  { make: "MDC", models: [
    { m: "XT12 Camper", style: "camper", len: 12, tare: 1400, atm: 1900 },
  ]},
  { make: "Cub", models: [
    { m: "Frontier Camper", style: "camper", len: 13, tare: 1250, atm: 1650 },
  ]},
  { make: "Avan", models: [
    { m: "Aliner 2", style: "camper", len: 12, tare: 850, atm: 1100 },
    { m: "Cruiseliner 2D", style: "camper", len: 13, tare: 950, atm: 1250 },
    { m: "Aspire 499", style: "full", len: 16, tare: 1500, atm: 1900 },
    { m: "Aspire 555", style: "full", len: 18, tare: 1750, atm: 2200 },
  ]},
  { make: "Regent", models: [
    { m: "Cruiser 21'6", style: "full", len: 21, tare: 2700, atm: 3300 },
  ]},
  { make: "Roma", models: [
    { m: "Elegance 19'6", style: "full", len: 19, tare: 2450, atm: 3000 },
  ]},
  { make: "Supreme", models: [
    { m: "Territory 19", style: "off", len: 19, tare: 2600, atm: 3200 },
  ]},
  { make: "Millard", models: [
    { m: "M-Flow 18", style: "full", len: 18, tare: 2100, atm: 2600 },
  ]},
  { make: "Viscount", models: [
    { m: "Grand Tourer 16 (classic)", style: "full", len: 16, tare: 1250, atm: 1600 },
  ]},
  { make: "Franklin", models: [
    { m: "Arrow 15 (classic)", style: "full", len: 15, tare: 1150, atm: 1450 },
  ]},
  { make: "Evernew", models: [
    { m: "E Series 19", style: "full", len: 19, tare: 2300, atm: 2900 },
  ]},
  { make: "Golf", models: [
    { m: "Maxxi 19'6", style: "full", len: 19, tare: 2200, atm: 2750 },
    { m: "Tourer 16 Pop-Top", style: "pop", len: 16, tare: 1700, atm: 2100 },
  ]},
  { make: "Olympic", models: [
    { m: "Javelin 19", style: "full", len: 19, tare: 2350, atm: 2900 },
  ]},
  { make: "Concept", models: [
    { m: "Ascot 18", style: "full", len: 18, tare: 2150, atm: 2650 },
  ]},
  { make: "Royal Flair", models: [
    { m: "Razor 18'6", style: "off", len: 18, tare: 2500, atm: 3200 },
    { m: "Van Royce 20", style: "full", len: 20, tare: 2500, atm: 3100 },
  ]},
  { make: "Paramount", models: [
    { m: "Duet 19", style: "full", len: 19, tare: 2400, atm: 3000 },
  ]},
  { make: "Legend", models: [
    { m: "Trackline 19", style: "off", len: 19, tare: 2700, atm: 3400 },
  ]},
  { make: "Snowy River", models: [
    { m: "SRC-18", style: "full", len: 18, tare: 2150, atm: 2700 },
    { m: "SRC-21", style: "full", len: 21, tare: 2450, atm: 3050 },
    { m: "SRT-15 Off-Road", style: "off", len: 15, tare: 2050, atm: 2600 },
  ]},
  { make: "Regal", models: [
    { m: "Comfort Tourer 19", style: "full", len: 19, tare: 2400, atm: 2950 },
  ]},
  { make: "JB Caravans", models: [
    { m: "Gator 19'6", style: "off", len: 19, tare: 2750, atm: 3500 },
    { m: "Scorpion 16", style: "off", len: 16, tare: 2400, atm: 3000 },
  ]},
  { make: "Nova", models: [
    { m: "Bravo 18'8", style: "full", len: 18, tare: 2350, atm: 2900 },
    { m: "Metrovan 16", style: "full", len: 16, tare: 2050, atm: 2500 },
  ]},
  { make: "Urban", models: [
    { m: "Compass 19", style: "off", len: 19, tare: 2800, atm: 3500 },
  ]},
  { make: "On The Move", models: [
    { m: "Grenade 20", style: "off", len: 20, tare: 2900, atm: 3500 },
  ]},
  { make: "Sunland", models: [
    { m: "Patriot 19", style: "off", len: 19, tare: 2800, atm: 3500 },
  ]},
  { make: "Bushtracker", models: [
    { m: "18' Custom Off-Road", style: "off", len: 18, tare: 3100, atm: 3990 },
  ]},
  { make: "Kedron", models: [
    { m: "Cross Country 19", style: "off", len: 19, tare: 3100, atm: 3990 },
  ]},
  { make: "Trakmaster", models: [
    { m: "Pilbara 17", style: "off", len: 17, tare: 2600, atm: 3300 },
  ]},
  { make: "Adria", models: [
    { m: "Altea 552 (Euro light)", style: "full", len: 18, tare: 1450, atm: 1800 },
    { m: "Adora 613", style: "full", len: 20, tare: 1750, atm: 2000 },
  ]},
  { make: "Bailey", models: [
    { m: "Phoenix+ 644 (UK light)", style: "full", len: 21, tare: 1500, atm: 2000 },
  ]},
  { make: "Patriot Campers", models: [
    { m: "X1", style: "camper", len: 13, tare: 1450, atm: 2000 },
    { m: "X3", style: "camper", len: 12, tare: 1050, atm: 1500 },
  ]},
  { make: "Track Trailer", models: [
    { m: "Tvan Canning", style: "camper", len: 13, tare: 1080, atm: 1450 },
  ]},
  { make: "Ezytrail", models: [
    { m: "Parkes 13 Hybrid", style: "off", len: 13, tare: 1750, atm: 2250 },
  ]},
  { make: "Austrack", models: [
    { m: "Telegraph X Hybrid", style: "off", len: 15, tare: 1900, atm: 2500 },
  ]},
];
/* A→Z menu order for the caravan pickers; physical indexes untouched so saved trips stay valid */
const VAN_MAKE_ORDER = VAN_DATA.map((_, i) => i).sort((a, b) => VAN_DATA[a].make.localeCompare(VAN_DATA[b].make));
const VAN_MODEL_ORDER = VAN_DATA.map((mk) => mk.models.map((_, i) => i).sort((a, b) => mk.models[a].m.localeCompare(mk.models[b].m)));

const STYLE_LABEL = { camper: "camper", pop: "pop-top", full: "full-height", off: "off-road full-height" };

/* ---------- Box / utility / boat trailers ---------- */
const TRAILER_SIZES = [
  { id: "6x4",   name: "6×4 single axle",      tare: 220, profile: 0.03, atms: [750, 1400] },
  { id: "7x4",   name: "7×4 single axle",      tare: 260, profile: 0.03, atms: [750, 1400] },
  { id: "7x5",   name: "7×5 single axle",      tare: 300, profile: 0.03, atms: [1400, 2000] },
  { id: "8x5",   name: "8×5 single axle",      tare: 340, profile: 0.04, atms: [1400, 2000] },
  { id: "8x5t",  name: "8×5 tandem",           tare: 450, profile: 0.04, atms: [2000, 2800, 3500] },
  { id: "10x6t", name: "10×6 tandem",          tare: 620, profile: 0.05, atms: [2800, 3500] },
  { id: "car",   name: "Car trailer (tandem)", tare: 750, profile: 0.06, atms: [2000, 2800, 3500] },
  { id: "boat",  name: "Boat trailer",         tare: 400, profile: 0.06, atms: [1400, 2000, 2500] },
];

function towFactor(weightKg, profile) {
  return 1 + (weightKg / 1000) * 0.08 + profile;
}
function vanProfile(style, len) {
  if (style === "camper") return 0.05;
  if (style === "pop") return 0.12;
  return 0.18 + Math.max(0, Math.min(0.04, (len - 19) * 0.01));
}

const TERR = { f: 1.0, r: 1.06, h: 1.14, y: 0, u: 1.22 }; /* y = ferry (no fuel) · u = unsealed (+22% burn) */

/* ---------- Waypoint network with stop guides ---------- */
const NODES = {
  adelaide: { n: "Adelaide", k: "city", f: true, d: 0, g: "Adelaide & Mid North", st: "SA",
    hrs: "24 hr fuel citywide", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Central Market; Adelaide Hills & Barossa day trips", stay: "Caravan parks across the metro" },
  ptwakefield: { n: "Port Wakefield", k: "town", f: true, d: 0.03, g: "Adelaide & Mid North", st: "SA",
    hrs: "Servos ~5am–11pm", fac: ["Fuel", "Bakery", "Toilets"],
    see: "Classic halfway snack stop on the gulf", stay: "Port Wakefield Caravan Park" },
  ptpirie: { n: "Port Pirie", k: "town", f: true, d: 0.03, g: "Adelaide & Mid North", st: "SA",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food", "Dump point"],
    see: "Smelter-town history; Flinders gateway", stay: "Port Pirie Beach Caravan Park" },
  ptaugusta: { n: "Port Augusta", k: "town", f: true, d: 0.05, g: "Adelaide & Mid North", st: "SA",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food", "Showers", "Dump point"],
    see: "Arid Lands Botanic Garden; Wadlata Outback Centre", stay: "Foreshore caravan parks" },
  quorn: { n: "Quorn", k: "town", f: true, d: 0.1, g: "Flinders Ranges", st: "SA",
    hrs: "~7am–7pm", fac: ["Fuel", "Pub", "Cafe"],
    see: "Pichi Richi steam railway", stay: "Quorn Caravan Park" },
  hawker: { n: "Hawker", k: "town", f: true, d: 0.15, g: "Flinders Ranges", st: "SA",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Jeff Morgan panorama gallery; range lookouts", stay: "Hawker Caravan Park" },
  wilpena: { n: "Wilpena Pound", k: "town", f: true, d: 0.3, wk: true, g: "Flinders Ranges", st: "SA",
    hrs: "Resort store ~8am–5pm", fac: ["Fuel", "Store", "Showers"],
    see: "Wilpena Pound walks; scenic flights", stay: "Wilpena Pound Resort & campground" },
  pimba: { n: "Pimba (Spud's)", k: "rh", f: true, d: 0.25, g: "Stuart Hwy — Outback SA", st: "SA",
    hrs: "Typically 24 hr", fac: ["Fuel", "Diner", "Toilets"],
    see: "Woomera rocket park & museum, 7 km", stay: "Spud's camping; Woomera motel" },
  glendambo: { n: "Glendambo", k: "rh", f: true, d: 0.35, g: "Stuart Hwy — Outback SA", st: "SA",
    hrs: "~6am–10pm", fac: ["Fuel", "Diner", "Showers", "Motel"],
    see: "Last stop before the desert proper", stay: "Glendambo Hotel-Motel & sites" },
  cooberpedy: { n: "Coober Pedy", k: "town", f: true, d: 0.25, g: "Stuart Hwy — Outback SA", st: "SA",
    hrs: "Fuel to ~10pm; some card 24 hr", fac: ["Fuel", "Supermarket", "Food", "Showers"],
    see: "Underground homes & churches; the Breakaways", stay: "Underground motels; Riba's camping" },
  cadney: { n: "Cadney Homestead", k: "rh", f: true, d: 0.4, g: "Stuart Hwy — Outback SA", st: "SA",
    hrs: "~7am–9pm", fac: ["Fuel", "Food", "Showers", "Camping"],
    see: "Painted Desert track turnoff", stay: "Cadney cabins & sites" },
  marla: { n: "Marla", k: "rh", f: true, d: 0.35, g: "Stuart Hwy — Outback SA", st: "SA",
    hrs: "Typically 24 hr", fac: ["Fuel", "Diner", "Showers", "Motel"],
    see: "Oodnadatta Track junction", stay: "Marla Travellers Rest" },
  kulgera: { n: "Kulgera", k: "rh", f: true, d: 0.4, g: "Red Centre (NT)", st: "NT",
    hrs: "~7am–10pm", fac: ["Fuel", "Pub", "Camping"],
    see: "First & last pub in the NT", stay: "Kulgera Roadhouse sites" },
  erldunda: { n: "Erldunda", k: "rh", f: true, d: 0.45, g: "Red Centre (NT)", st: "NT",
    hrs: "~7am–9pm", fac: ["Fuel", "Food", "Showers", "Emu farm"],
    see: "The turnoff to Uluru — centre of the centre", stay: "Erldunda Desert Oaks Resort" },
  curtin: { n: "Curtin Springs", k: "rh", f: true, d: 0.5, g: "Red Centre (NT)", st: "NT",
    hrs: "~7am–late", fac: ["Fuel", "Food", "Camping"],
    see: "Mt Conner lookout nearby", stay: "Curtin Springs camping & rooms" },
  yulara: { n: "Yulara (Uluru)", k: "town", f: true, d: 0.45, wk: true, g: "Red Centre (NT)", st: "NT",
    hrs: "~7am–9pm", fac: ["Fuel", "Supermarket", "Food", "Pool"],
    see: "Uluru & Kata Tjuta — sunrise and sunset viewing", stay: "Ayers Rock Resort, campground to hotels" },
  alicesprings: { n: "Alice Springs", k: "city", f: true, d: 0.15, g: "Red Centre (NT)", st: "NT",
    hrs: "24 hr fuel", fac: ["All services", "Supermarkets", "Mechanics"],
    see: "Desert Park; Telegraph Station; MacDonnell Ranges", stay: "Several big caravan parks" },
  titree: { n: "Ti Tree", k: "rh", f: true, d: 0.35, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~6am–9pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Central Australia's market garden", stay: "Ti Tree Roadhouse sites" },
  barrowck: { n: "Barrow Creek", k: "rh", f: true, d: 0.4, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~7am–9pm", fac: ["Fuel", "Pub"],
    see: "Historic telegraph station; pub wall of banknotes", stay: "Basic camping behind the pub" },
  tennant: { n: "Tennant Creek", k: "town", f: true, d: 0.2, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "Fuel to ~11pm", fac: ["Supermarket", "Food", "Showers"],
    see: "Nyinkka Nyunyu centre; Devils Marbles 100 km south", stay: "Tennant Creek caravan parks" },
  renner: { n: "Renner Springs", k: "rh", f: true, d: 0.4, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~6am–9pm", fac: ["Fuel", "Food", "Camping"],
    see: "Classic Territory roadhouse stop", stay: "Renner Springs Desert Inn" },
  elliott: { n: "Elliott", k: "town", f: true, d: 0.35, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~7am–9pm", fac: ["Fuel", "Store"],
    see: "Longreach Waterhole nearby", stay: "Midland Caravan Park" },
  dunmarra: { n: "Dunmarra", k: "rh", f: true, d: 0.4, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~6am–10pm", fac: ["Fuel", "Food", "Pool", "Camping"],
    see: "Buchanan Hwy junction", stay: "Dunmarra Wayside Inn" },
  dalywaters: { n: "Daly Waters", k: "rh", f: true, d: 0.4, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~7am–late", fac: ["Fuel", "Historic pub", "Food"],
    see: "Daly Waters Pub — memorabilia & live music in season", stay: "Pub campground — book ahead" },
  mataranka: { n: "Mataranka", k: "town", f: true, d: 0.25, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~6am–9pm", fac: ["Fuel", "Store", "Food"],
    see: "Mataranka & Bitter Springs thermal pools", stay: "Mataranka Homestead & parks" },
  katherine: { n: "Katherine", k: "town", f: true, d: 0.1, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food", "Mechanics"],
    see: "Nitmiluk (Katherine Gorge) cruises & walks", stay: "Several caravan parks" },
  adelriver: { n: "Adelaide River", k: "town", f: true, d: 0.15, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~6am–9pm", fac: ["Fuel", "Pub", "Food"],
    see: "War cemetery; jumping croc cruises nearby", stay: "Showgrounds camping" },
  darwin: { n: "Darwin", k: "city", f: true, d: 0.05, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "24 hr fuel", fac: ["All services"],
    see: "Mindil Beach markets; Litchfield day trips", stay: "Metro caravan parks & hotels" },
  ironknob: { n: "Iron Knob", k: "town", f: false, d: 0, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "No fuel — plan around it", fac: ["Toilets", "Lookout"],
    see: "Historic iron-ore town lookout", stay: "Donation free camp" },
  kimba: { n: "Kimba", k: "town", f: true, d: 0.1, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "~6am–9pm", fac: ["Fuel", "Bakery", "Toilets"],
    see: "Halfway Across Australia sign; silo art", stay: "Recreation reserve camping" },
  wudinna: { n: "Wudinna", k: "town", f: true, d: 0.1, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "~6am–9pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Mount Wudinna granite; Australian Farmer sculpture", stay: "Gawler Ranges caravan park" },
  ceduna: { n: "Ceduna", k: "town", f: true, d: 0.1, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "Fuel to ~10pm", fac: ["Supermarket", "Food", "Showers"],
    see: "Oyster country — try Smoky Bay", stay: "Foreshore caravan parks" },
  penong: { n: "Penong", k: "town", f: true, d: 0.15, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "~7am–8pm", fac: ["Fuel", "Store"],
    see: "Windmill museum; Cactus Beach surf", stay: "Penong Caravan Park" },
  nundroo: { n: "Nundroo", k: "rh", f: true, d: 0.35, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "~7am–9pm", fac: ["Fuel", "Food", "Motel"],
    see: "Edge of the Nullarbor proper", stay: "Nundroo Roadhouse rooms & sites" },
  nullarborrh: { n: "Nullarbor Roadhouse", k: "rh", f: true, d: 0.5, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "Typically 24 hr", fac: ["Fuel", "Food", "Showers", "Airstrip"],
    see: "Head of Bight whale watching in season", stay: "Roadhouse motel & camping" },
  bordervillage: { n: "Border Village", k: "rh", f: true, d: 0.45, g: "Eyre Hwy — Nullarbor", st: "SA",
    hrs: "Typically 24 hr", fac: ["Fuel", "Food", "Quarantine bin"],
    see: "Big Rooey; WA border checkpoint", stay: "Border Village motel & sites" },
  eucla: { n: "Eucla", k: "rh", f: true, d: 0.45, g: "Eyre Hwy — Nullarbor", st: "WA",
    hrs: "~6am–10pm", fac: ["Fuel", "Food", "Museum"],
    see: "Old telegraph station ruins in the dunes", stay: "Eucla motel & camping" },
  mundrabilla: { n: "Mundrabilla", k: "rh", f: true, d: 0.45, g: "Eyre Hwy — Nullarbor", st: "WA",
    hrs: "~6am–10pm", fac: ["Fuel", "Food", "Camping"],
    see: "Often the cheapest fuel on the WA side", stay: "Roadhouse sites" },
  madura: { n: "Madura", k: "rh", f: true, d: 0.45, g: "Eyre Hwy — Nullarbor", st: "WA",
    hrs: "~6am–10pm", fac: ["Fuel", "Food", "Pool"],
    see: "Madura Pass lookout", stay: "Madura Pass Oasis Motel" },
  cocklebiddy: { n: "Cocklebiddy", k: "rh", f: true, d: 0.45, g: "Eyre Hwy — Nullarbor", st: "WA",
    hrs: "~6am–10pm", fac: ["Fuel", "Food"],
    see: "Eyre Bird Observatory track", stay: "Wedgetail Inn rooms & sites" },
  caiguna: { n: "Caiguna", k: "rh", f: true, d: 0.45, g: "Eyre Hwy — Nullarbor", st: "WA",
    hrs: "Typically 24 hr", fac: ["Fuel", "Food", "Showers"],
    see: "Start of the 90 Mile Straight", stay: "Caiguna Roadhouse sites" },
  balladonia: { n: "Balladonia", k: "rh", f: true, d: 0.45, g: "Eyre Hwy — Nullarbor", st: "WA",
    hrs: "~6am–10pm", fac: ["Fuel", "Food", "Museum"],
    see: "Skylab crash-site museum", stay: "Balladonia Hotel-Motel & camping" },
  norseman: { n: "Norseman", k: "town", f: true, d: 0.15, g: "WA — Goldfields to Perth", st: "WA",
    hrs: "Fuel to ~9pm", fac: ["Supermarket", "Food", "Showers"],
    see: "Beacon Hill lookout; the tin camels", stay: "Gateway Caravan Park" },
  coolgardie: { n: "Coolgardie", k: "town", f: true, d: 0.1, g: "WA — Goldfields to Perth", st: "WA",
    hrs: "~6am–9pm", fac: ["Fuel", "Food", "Museum"],
    see: "Goldfields museum & wide main street", stay: "Coolgardie Tourist Village" },
  southerncross: { n: "Southern Cross", k: "town", f: true, d: 0.1, g: "WA — Goldfields to Perth", st: "WA",
    hrs: "~6am–9pm", fac: ["Fuel", "Food"],
    see: "Yilgarn history museum", stay: "Southern Cross Caravan Park" },
  merredin: { n: "Merredin", k: "town", f: true, d: 0.08, g: "WA — Goldfields to Perth", st: "WA",
    hrs: "Fuel to ~10pm", fac: ["Supermarket", "Food"],
    see: "Cummins Theatre; wheatbelt silo art", stay: "Merredin Caravan Park" },
  northam: { n: "Northam", k: "town", f: true, d: 0.05, g: "WA — Goldfields to Perth", st: "WA",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "Avon Valley; hot-air ballooning", stay: "Northam Caravan Park" },
  perth: { n: "Perth", k: "city", f: true, d: 0, g: "WA — Goldfields to Perth", st: "WA",
    hrs: "24 hr fuel", fac: ["All services"],
    see: "Kings Park; Fremantle; Rottnest", stay: "Metro parks & hotels" },
  murraybridge: { n: "Murray Bridge", k: "town", f: true, d: 0.02, g: "Toward Melbourne", st: "SA",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "Murray riverfront; Monarto Safari Park 15 min", stay: "Riverfront caravan parks" },
  tailembend: { n: "Tailem Bend", k: "town", f: true, d: 0.03, g: "Toward Melbourne", st: "SA",
    hrs: "Typically 24 hr", fac: ["Fuel", "Food"],
    see: "The Bend Motorsport Park", stay: "River camps at the Wellington ferry" },
  keith: { n: "Keith", k: "town", f: true, d: 0.08, g: "Toward Melbourne", st: "SA",
    hrs: "~6am–10pm", fac: ["Fuel", "Food"],
    see: "Ninety-mile desert land story", stay: "Keith Caravan Park" },
  bordertown: { n: "Bordertown", k: "town", f: true, d: 0.07, g: "Toward Melbourne", st: "SA",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "White kangaroos at the wildlife park", stay: "Bordertown Caravan Park" },
  nhill: { n: "Nhill", k: "town", f: true, d: 0.07, g: "Toward Melbourne", st: "VIC",
    hrs: "~6am–10pm", fac: ["Fuel", "Bakery"],
    see: "Wimmera silo art trail nearby", stay: "Nhill Caravan Park" },
  horsham: { n: "Horsham", k: "town", f: true, d: 0.05, g: "Toward Melbourne", st: "VIC",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "Gateway to the Grampians", stay: "Riverside caravan park" },
  ararat: { n: "Ararat", k: "town", f: true, d: 0.05, g: "Toward Melbourne", st: "VIC",
    hrs: "Fuel to ~10pm", fac: ["Supermarket", "Food"],
    see: "J Ward museum; eastern Grampians", stay: "Acacia Caravan Park" },
  ballarat: { n: "Ballarat", k: "city", f: true, d: 0.02, g: "Toward Melbourne", st: "VIC",
    hrs: "24 hr fuel", fac: ["All services"],
    see: "Sovereign Hill goldfields", stay: "Big parks near the lake" },
  melbourne: { n: "Melbourne", k: "city", f: true, d: 0, g: "Toward Melbourne", st: "VIC",
    hrs: "24 hr fuel", fac: ["All services"],
    see: "Great Ocean Road staging city", stay: "Metro parks & hotels" },
  waikerie: { n: "Waikerie", k: "town", f: true, d: 0.06, g: "Toward Sydney", st: "SA",
    hrs: "~6am–9pm", fac: ["Fuel", "Bakery"],
    see: "Riverland cliffs & houseboats", stay: "Waikerie riverfront caravan park" },
  renmark: { n: "Renmark", k: "town", f: true, d: 0.05, g: "Toward Sydney", st: "SA",
    hrs: "Fuel to ~10pm", fac: ["Supermarket", "Food"],
    see: "Paddle steamers; Paringa bridge", stay: "Riverfront caravan parks" },
  mildura: { n: "Mildura", k: "town", f: true, d: 0.04, wk: true, g: "Toward Sydney", st: "VIC",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food", "Mechanics"],
    see: "Murray cruises; wineries", stay: "Many river parks" },
  euston: { n: "Euston", k: "town", f: true, d: 0.1, g: "Toward Sydney", st: "NSW",
    hrs: "~6am–9pm", fac: ["Fuel", "Club meals"],
    see: "Lock 15 & river red gums", stay: "Euston riverfront caravan park" },
  balranald: { n: "Balranald", k: "town", f: true, d: 0.1, g: "Toward Sydney", st: "NSW",
    hrs: "~6am–10pm", fac: ["Fuel", "Food"],
    see: "Mungo National Park turnoff", stay: "Balranald Caravan Park" },
  hay: { n: "Hay", k: "town", f: true, d: 0.08, g: "Toward Sydney", st: "NSW",
    hrs: "Fuel to ~11pm", fac: ["Supermarket", "Food"],
    see: "Shear Outback centre; POW museum", stay: "River camps & caravan parks" },
  narrandera: { n: "Narrandera", k: "town", f: true, d: 0.07, g: "Toward Sydney", st: "NSW",
    hrs: "~6am–10pm", fac: ["Fuel", "Food"],
    see: "Koala reserve walks", stay: "Lake Talbot Caravan Park" },
  wagga: { n: "Wagga Wagga", k: "city", f: true, d: 0.03, g: "Toward Sydney", st: "NSW",
    hrs: "24 hr fuel", fac: ["All services"],
    see: "Botanic gardens; river beach", stay: "Several caravan parks" },
  gundagai: { n: "Gundagai", k: "town", f: true, d: 0.06, g: "Toward Sydney", st: "NSW",
    hrs: "Typically 24 hr", fac: ["Fuel", "Food"],
    see: "Dog on the Tuckerbox", stay: "River caravan park" },
  yass: { n: "Yass", k: "town", f: true, d: 0.05, g: "Toward Sydney", st: "NSW",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "Historic main street; Canberra 45 min", stay: "Yass Caravan Park" },
  goulburn: { n: "Goulburn", k: "town", f: true, d: 0.03, g: "Toward Sydney", st: "NSW",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "The Big Merino", stay: "South Goulburn caravan park" },
  sydney: { n: "Sydney", k: "city", f: true, d: 0, g: "Toward Sydney", st: "NSW",
    hrs: "24 hr fuel", fac: ["All services"],
    see: "You made it — harbour time", stay: "Metro parks & hotels" },
  seymour: { n: "Seymour", k: "town", f: true, d: 0.03, g: "Hume", st: "VIC",
    hrs: "Fuel to ~11pm", fac: ["Fuel", "Food"],
    see: "Vietnam Veterans Commemorative Walk", stay: "Goulburn River caravan parks" },
  benalla: { n: "Benalla", k: "town", f: true, d: 0.03, g: "Hume", st: "VIC",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "Benalla street art & gallery", stay: "Lake Benalla caravan park" },
  wangaratta: { n: "Wangaratta", k: "town", f: true, d: 0.03, g: "Hume", st: "VIC",
    hrs: "24 hr fuel", fac: ["Supermarket", "Food"],
    see: "Gateway to King Valley wineries", stay: "Painters Island Caravan Park" },
  albury: { n: "Albury-Wodonga", k: "city", f: true, d: 0.02, g: "Hume", st: "NSW",
    hrs: "24 hr fuel", fac: ["All services"],
    see: "Murray river beaches; MAMA gallery", stay: "Several river caravan parks" },
  holbrook: { n: "Holbrook", k: "town", f: true, d: 0.05, g: "Hume", st: "NSW",
    hrs: "Typically 24 hr", fac: ["Fuel", "Bakery"],
    see: "The submarine in the park", stay: "Holbrook Motor Village" },
  burra: { n: "Burra", k: "town", f: true, d: 0.08, g: "Barrier Hwy", st: "SA",
    hrs: "~7am–8pm", fac: ["Fuel", "Bakery", "Pub"],
    see: "Burra heritage passport & mine", stay: "Burra Caravan Park" },
  peterborough: { n: "Peterborough", k: "town", f: true, d: 0.08, g: "Barrier Hwy", st: "SA",
    hrs: "~6am–9pm", fac: ["Fuel", "Food"],
    see: "Steamtown rail heritage centre", stay: "Peterborough Caravan Park" },
  yunta: { n: "Yunta", k: "rh", f: true, d: 0.2, g: "Barrier Hwy", st: "SA",
    hrs: "~6am–9pm", fac: ["Fuel", "Food"],
    see: "Gateway to Flinders back tracks", stay: "Roadhouse sites" },
  brokenhill: { n: "Broken Hill", k: "city", f: true, d: 0.1, wk: true, g: "Barrier Hwy", st: "NSW",
    hrs: "24 hr fuel", fac: ["All services", "Supermarkets"],
    see: "Line of Lode; Pro Hart gallery; Silverton 25 km", stay: "Broken Hill caravan parks" },
  wentworth: { n: "Wentworth", k: "town", f: true, d: 0.07, g: "Barrier Hwy", st: "NSW",
    hrs: "~6am–9pm", fac: ["Fuel", "Food"],
    see: "Murray–Darling junction", stay: "Willow Bend Caravan Park" },
  victorharbor: { n: "Victor Harbor", k: "town", f: true, d: 0.03, wk: true, g: "Fleurieu", st: "SA",
    hrs: "Fuel to ~10pm", fac: ["Supermarket", "Food"],
    see: "Granite Island tram; whales in season", stay: "Beachfront caravan parks" },
  wauchope: { n: "Wauchope (Devils Marbles)", k: "rh", f: true, d: 0.4, g: "Stuart Hwy — Alice to Darwin", st: "NT",
    hrs: "~7am–9pm", fac: ["Fuel", "Pub", "Camping"],
    see: "Karlu Karlu / Devils Marbles at sunrise", stay: "Devils Marbles campground; pub sites" },

  /* ---- Sydney → Brisbane coast (NSW) ---- */
  newcastle: { n: "Newcastle", k: "city", f: true, d: 0, g: "Sydney → Brisbane coast", st: "NSW",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Merewether Ocean Baths; Nobbys Lighthouse walk", stay: "Stockton Beach Holiday Park" },
  portmacquarie: { n: "Port Macquarie", k: "town", f: true, d: 0.02, g: "Sydney → Brisbane coast", st: "NSW",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Koala Hospital; Town Beach breakwall art", stay: "NRMA Port Macquarie" },
  coffsharbour: { n: "Coffs Harbour", k: "city", f: true, d: 0.02, g: "Sydney → Brisbane coast", st: "NSW",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "The Big Banana; jetty & marina at sunset", stay: "Park Beach Holiday Park" },
  grafton: { n: "Grafton", k: "town", f: true, d: 0.03, g: "Sydney → Brisbane coast", st: "NSW",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Food"],
    see: "Jacaranda avenues (Oct–Nov); Clarence riverbanks", stay: "Big River holiday parks on the Clarence" },
  ballina: { n: "Ballina", k: "town", f: true, d: 0.02, g: "Sydney → Brisbane coast", st: "NSW",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "The Big Prawn; Byron Bay day trip", stay: "Ballina Lakeside Holiday Park" },

  /* ---- South East Queensland ---- */
  goldcoast: { n: "Gold Coast", k: "city", f: true, d: 0, g: "South East Queensland", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Surfers skyline; Springbrook hinterland day trip", stay: "Broadwater Tourist Park" },
  brisbane: { n: "Brisbane", k: "city", f: true, d: 0, g: "South East Queensland", st: "QLD",
    hrs: "24 hr fuel citywide", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "South Bank lagoon; Lone Pine koalas", stay: "Brisbane Holiday Village, Eight Mile Plains" },
  sunshinecoast: { n: "Sunshine Coast", k: "city", f: true, d: 0, g: "South East Queensland", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Maroochy beaches; Eumundi Markets (Wed & Sat)", stay: "Cotton Tree Holiday Park" },
  gympie: { n: "Gympie", k: "town", f: true, d: 0.02, g: "South East Queensland", st: "QLD",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarket", "Food"],
    see: "Gold-rush history; Mary Valley Rattler steam train", stay: "Gympie Caravan Park" },

  /* ---- Queensland coast (Bruce Hwy) ---- */
  maryborough: { n: "Maryborough", k: "town", f: true, d: 0.02, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarket", "Dump point"],
    see: "Mary Poppins trail; Hervey Bay whales 30 min away", stay: "Huntsville Caravan Park" },
  bundaberg: { n: "Bundaberg", k: "town", f: true, d: 0.02, wk: true, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Bundaberg Rum Distillery; Mon Repos turtles (Nov–Mar)", stay: "Bargara Beach Caravan Park" },
  gladstone: { n: "Gladstone", k: "town", f: true, d: 0.03, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarket", "Food"],
    see: "Harbour lookout; gateway to Agnes Water & 1770", stay: "Barney Point & Tannum Sands parks" },
  rockhampton: { n: "Rockhampton", k: "city", f: true, d: 0.03, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Beef capital; Capricorn Caves; free zoo in the gardens", stay: "Riverside Tourist Park" },
  mackay: { n: "Mackay", k: "town", f: true, d: 0.03, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Bluewater Lagoon; Eungella platypus day trip", stay: "BIG4 Mackay Marine" },
  proserpine: { n: "Proserpine (Airlie)", k: "town", f: true, d: 0.04, wk: true, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarket", "Food"],
    see: "Airlie Beach & the Whitsundays 25 min away", stay: "BIG4 Adventure Whitsunday, Airlie" },
  bowen: { n: "Bowen", k: "town", f: true, d: 0.04, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Food"],
    see: "The Big Mango; Horseshoe Bay", stay: "Queens Beach Tourist Village" },
  townsville: { n: "Townsville", k: "city", f: true, d: 0.03, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "The Strand; Magnetic Island ferry", stay: "BIG4 Rowes Bay" },
  cardwell: { n: "Cardwell", k: "town", f: true, d: 0.06, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "~6am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Hinchinbrook Island lookout; famous highway pie shop", stay: "Cardwell Beachcomber" },
  innisfail: { n: "Innisfail", k: "town", f: true, d: 0.04, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "~5am–9pm", fac: ["Fuel", "Supermarket", "Food"],
    see: "Art-deco main street; Paronella Park 20 min", stay: "Flying Fish Point Tourist Park" },
  cairns: { n: "Cairns", k: "city", f: true, d: 0.03, g: "Queensland coast (Bruce Hwy)", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Reef trips; Esplanade Lagoon; Kuranda scenic rail", stay: "Cairns Coconut Holiday Resort" },

  /* ---- Barkly & Flinders Hwys — closing the Big Lap ---- */
  barklyhs: { n: "Barkly Homestead", k: "rh", f: true, d: 0.45, g: "Barkly Hwy — NT", st: "NT",
    hrs: "Roadhouse ~6am–10pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "The only stop on the Barkly — sunsets forever", stay: "Barkly Homestead van park" },
  camooweal: { n: "Camooweal", k: "town", f: true, d: 0.3, g: "Outback Queensland", st: "QLD",
    hrs: "~6am–9pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Drovers Camp museum; Georgina River camps", stay: "Post Office Hotel van sites" },
  mtisa: { n: "Mount Isa", k: "city", f: true, d: 0.1, g: "Outback Queensland", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Hard Times Mine tour; City Lookout at dusk", stay: "Sunset Top Tourist Park" },
  cloncurry: { n: "Cloncurry", k: "town", f: true, d: 0.15, g: "Outback Queensland", st: "QLD",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarket", "Food"],
    see: "Birthplace of the Flying Doctor — John Flynn Place", stay: "Discovery Parks Cloncurry" },
  juliacreek: { n: "Julia Creek", k: "town", f: true, d: 0.2, g: "Outback Queensland", st: "QLD",
    hrs: "~6am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Artesian bathhouse under outback stars", stay: "Julia Creek Caravan Park (artesian baths)" },
  richmondq: { n: "Richmond (QLD)", k: "town", f: true, d: 0.2, g: "Outback Queensland", st: "QLD",
    hrs: "~6am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Kronosaurus Korner — marine fossil country", stay: "Lakeview Caravan Park" },
  hughenden: { n: "Hughenden", k: "town", f: true, d: 0.18, g: "Outback Queensland", st: "QLD",
    hrs: "~6am–8pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Dinosaur country; Porcupine Gorge 60 km north", stay: "Allen Terry Caravan Park" },
  charterstowers: { n: "Charters Towers", k: "town", f: true, d: 0.1, g: "Outback Queensland", st: "QLD",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Gold-rush streetscapes; Towers Hill lookout", stay: "BIG4 Aussie Outback Oasis" },

  /* ---- Canberra & the ACT ---- */
  canberra: { n: "Canberra", k: "city", f: true, d: 0, wk: true, g: "Canberra & the ACT", st: "ACT",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Parliament House; War Memorial; lake loop", stay: "Exhibition Park (EPIC) powered sites" },

  /* ---- Geelong & the ferry ---- */
  geelong: { n: "Geelong", k: "city", f: true, d: 0, g: "Geelong & Bass Strait ferry", st: "VIC",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Waterfront bollards; Spirit of Tasmania terminal (Corio Quay); Great Ocean Road gateway",
    stay: "Discovery Parks Geelong" },

  /* ---- Tasmania — north & west ---- */
  devonport: { n: "Devonport", k: "town", f: true, d: 0.06, g: "Tasmania — north & west", st: "TAS",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Spirit of Tasmania berth; Mersey Bluff lighthouse", stay: "Mersey Bluff Caravan Park" },
  burnie: { n: "Burnie", k: "town", f: true, d: 0.06, g: "Tasmania — north & west", st: "TAS",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Little penguins at dusk; Makers' Workshop", stay: "Burnie Holiday Caravan Park, Cooee" },
  stanley: { n: "Stanley", k: "town", f: true, d: 0.12, wk: true, g: "Tasmania — north & west", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "The Nut chairlift; heritage village streets", stay: "Stanley Cabin & Tourist Park" },
  sheffield: { n: "Sheffield", k: "town", f: true, d: 0.1, g: "Tasmania — north & west", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Town of Murals; Cradle Mountain gateway (60 km)", stay: "Sheffield Caravan Park (showground)" },
  launceston: { n: "Launceston", k: "city", f: true, d: 0.05, g: "Tasmania — north & west", st: "TAS",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Cataract Gorge chairlift; Tamar Valley wineries", stay: "BIG4 Launceston" },
  rosebery: { n: "Rosebery", k: "town", f: true, d: 0.15, g: "Tasmania — north & west", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Groceries", "Toilets"],
    see: "Montezuma Falls walk — Tasmania's tallest", stay: "Rosebery Cabin & Tourist Park" },
  queenstown: { n: "Queenstown", k: "town", f: true, d: 0.15, g: "Tasmania — north & west", st: "TAS",
    hrs: "~7am–8pm", fac: ["Fuel", "Supermarket", "Food"],
    see: "Bare copper hills; West Coast Wilderness Railway", stay: "Queenstown Cabin & Tourist Park" },
  strahan: { n: "Strahan", k: "town", f: true, d: 0.18, wk: true, g: "Tasmania — north & west", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Gordon River cruise; Hogarth Falls walk", stay: "Strahan Beach Tourist Park" },
  derwentbridge: { n: "Derwent Bridge", k: "rh", f: true, d: 0.25, g: "Tasmania — north & west", st: "TAS",
    hrs: "~8am–6pm", fac: ["Fuel", "Meals", "Toilets"],
    see: "Lake St Clair; The Wall in the Wilderness", stay: "Lake St Clair Lodge campground" },

  /* ---- Tasmania — south & east ---- */
  oatlands: { n: "Oatlands", k: "town", f: true, d: 0.1, g: "Tasmania — south & east", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Bakery", "Toilets"],
    see: "Callington Mill; Georgian sandstone streetscape", stay: "Lakeside RV area, Lake Dulverton" },
  sthelens: { n: "St Helens", k: "town", f: true, d: 0.12, wk: true, g: "Tasmania — south & east", st: "TAS",
    hrs: "~6am–8pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Bay of Fires just north — orange-lichen beaches", stay: "BIG4 St Helens" },
  bicheno: { n: "Bicheno", k: "town", f: true, d: 0.14, wk: true, g: "Tasmania — south & east", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Blowhole; penguin tours; Freycinet & Wineglass Bay 30 min", stay: "Bicheno East Coast Holiday Park" },
  swansea: { n: "Swansea", k: "town", f: true, d: 0.12, g: "Tasmania — south & east", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Great Oyster Bay views across to the Hazards", stay: "Swansea Holiday Park" },
  triabunna: { n: "Triabunna", k: "town", f: true, d: 0.1, g: "Tasmania — south & east", st: "TAS",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Maria Island ferry — take the pushbikes", stay: "Triabunna Cabin & Caravan Park" },
  sorell: { n: "Sorell", k: "town", f: true, d: 0.06, g: "Tasmania — south & east", st: "TAS",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Bakery"],
    see: "Junction town — roadside fruit stalls in season", stay: "Barilla Holiday Park nearby" },
  portarthur: { n: "Port Arthur", k: "town", f: false, d: 0.15, wk: true, g: "Tasmania — south & east", st: "TAS",
    hrs: "No fuel — fill at Sorell", fac: ["Historic site", "Cafe", "Toilets"],
    see: "Port Arthur Historic Site — allow half a day; Remarkable Cave", stay: "NRMA Port Arthur Holiday Park" },
  hobart: { n: "Hobart", k: "city", f: true, d: 0.05, g: "Tasmania — south & east", st: "TAS",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "MONA; Salamanca Market (Sat); kunanyi / Mt Wellington summit", stay: "Barilla Holiday Park, Cambridge" },
  hamiltontas: { n: "Hamilton (TAS)", k: "town", f: true, d: 0.12, g: "Tasmania — south & east", st: "TAS",
    hrs: "~8am–6pm", fac: ["Fuel", "Pub", "Toilets"],
    see: "Georgian village on the Clyde", stay: "Riverside camping reserve" },

  /* ---- Victoria Hwy — NT ---- */
  victoriariver: { n: "Victoria River", k: "rh", f: true, d: 0.35, g: "Victoria Hwy — NT", st: "NT",
    hrs: "Roadhouse ~7am–9pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "Escarpment country; boab-lined river crossing", stay: "Victoria River Roadhouse sites" },
  timbercreek: { n: "Timber Creek", k: "town", f: true, d: 0.35, g: "Victoria Hwy — NT", st: "NT",
    hrs: "~7am–9pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Croc-spotting cruises; Gregory's boab tree", stay: "Timber Creek Hotel caravan park" },

  /* ---- The Kimberley — WA ---- */
  kununurra: { n: "Kununurra", k: "town", f: true, d: 0.2, wk: true, g: "The Kimberley — WA", st: "WA",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Lake Argyle cruise; Ord River; Mirima mini-Bungles", stay: "Kimberleyland Waterfront Park" },
  warmun: { n: "Warmun (Turkey Creek)", k: "rh", f: true, d: 0.4, g: "The Kimberley — WA", st: "WA",
    hrs: "Roadhouse ~6am–9pm", fac: ["Fuel", "Meals", "Toilets"],
    see: "Purnululu (Bungle Bungles) chopper flights from here", stay: "Warmun Roadhouse sites" },
  hallscreek: { n: "Halls Creek", k: "town", f: true, d: 0.35, g: "The Kimberley — WA", st: "WA",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "China Wall quartz ridge; Bungles southern access", stay: "Halls Creek Caravan Park" },
  fitzroycrossing: { n: "Fitzroy Crossing", k: "town", f: true, d: 0.35, g: "The Kimberley — WA", st: "WA",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Danggu (Geikie) Gorge boat trip", stay: "Fitzroy River Lodge sites" },
  willare: { n: "Willare Bridge", k: "rh", f: true, d: 0.4, g: "The Kimberley — WA", st: "WA",
    hrs: "Roadhouse ~6am–9pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "Fitzroy floodplain boabs; Derby turnoff", stay: "Willare Bridge Roadhouse park" },
  derby: { n: "Derby", k: "town", f: true, d: 0.25, g: "The Kimberley — WA", st: "WA",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "11-metre tides at the wharf; Boab Prison Tree", stay: "Kimberley Entrance Caravan Park" },
  broome: { n: "Broome", k: "town", f: true, d: 0.15, wk: true, g: "The Kimberley — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Cable Beach camels at sunset; Staircase to the Moon", stay: "Cable Beach Caravan Park" },

  /* ---- Pilbara coast — WA ---- */
  sandfire: { n: "Sandfire Roadhouse", k: "rh", f: true, d: 0.45, g: "Pilbara coast — WA", st: "WA",
    hrs: "Roadhouse ~6am–9pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "The lonely middle of the Great Northern Hwy", stay: "Sandfire Roadhouse sites" },
  pardoo: { n: "Pardoo Roadhouse", k: "rh", f: true, d: 0.45, g: "Pilbara coast — WA", st: "WA",
    hrs: "Roadhouse ~6am–9pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "Eighty Mile Beach 45 min back up the road", stay: "Pardoo Roadhouse sites" },
  porthedland: { n: "Port Hedland", k: "town", f: true, d: 0.12, g: "Pilbara coast — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Iron-ore ships the size of suburbs; salt mountains", stay: "Discovery Parks Port Hedland" },
  roebourne: { n: "Roebourne", k: "town", f: true, d: 0.2, g: "Pilbara coast — WA", st: "WA",
    hrs: "~6am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Cossack ghost-town heritage 15 min away", stay: "Harding River Caravan Park" },
  karratha: { n: "Karratha", k: "town", f: true, d: 0.12, g: "Pilbara coast — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Murujuga rock art; Dampier's Red Dog statue", stay: "Discovery Parks Pilbara, Karratha" },
  nanutarra: { n: "Nanutarra Roadhouse", k: "rh", f: true, d: 0.45, g: "Pilbara coast — WA", st: "WA",
    hrs: "Roadhouse ~6am–9pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "Ashburton River crossing", stay: "Nanutarra Roadhouse sites" },

  /* ---- Ningaloo & Gascoyne — WA ---- */
  minilya: { n: "Minilya Roadhouse", k: "rh", f: true, d: 0.4, g: "Ningaloo & Gascoyne — WA", st: "WA",
    hrs: "Roadhouse ~6am–9pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "The Exmouth / Coral Bay turnoff", stay: "Minilya Roadhouse sites" },
  coralbay: { n: "Coral Bay", k: "town", f: true, d: 0.3, wk: true, g: "Ningaloo & Gascoyne — WA", st: "WA",
    hrs: "~7am–7pm", fac: ["Fuel", "Store", "Toilets"],
    see: "Snorkel Ningaloo straight off the beach", stay: "Peoples Park Coral Bay" },
  exmouth: { n: "Exmouth", k: "town", f: true, d: 0.15, wk: true, g: "Ningaloo & Gascoyne — WA", st: "WA",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Whale sharks (Mar–Jul); Turquoise Bay drift snorkel", stay: "RAC Exmouth Cape Holiday Park" },
  carnarvon: { n: "Carnarvon", k: "town", f: true, d: 0.15, g: "Ningaloo & Gascoyne — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Space & Technology Museum; plantation ice-cream", stay: "Wintersun Caravan Park" },
  overlander: { n: "Overlander Roadhouse", k: "rh", f: true, d: 0.4, g: "Ningaloo & Gascoyne — WA", st: "WA",
    hrs: "Roadhouse ~6am–9pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "Shark Bay / Monkey Mia turnoff", stay: "Overlander Roadhouse sites" },

  /* ---- Batavia & Turquoise coast — WA ---- */
  northampton: { n: "Northampton", k: "town", f: true, d: 0.1, g: "Batavia & Turquoise coast — WA", st: "WA",
    hrs: "~6am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Heritage-listed main street; Kalbarri turnoff", stay: "Northampton caravan park" },
  kalbarri: { n: "Kalbarri", k: "town", f: true, d: 0.15, wk: true, g: "Batavia & Turquoise coast — WA", st: "WA",
    hrs: "~6am–8pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Nature's Window; Skywalk; coastal cliffs", stay: "Kalbarri Anchorage Caravan Park" },
  geraldton: { n: "Geraldton", k: "city", f: true, d: 0.06, g: "Batavia & Turquoise coast — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "HMAS Sydney II Memorial; foreshore", stay: "Sunset Beach Holiday Park" },
  dongara: { n: "Dongara–Denison", k: "town", f: true, d: 0.08, g: "Batavia & Turquoise coast — WA", st: "WA",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Bakery"],
    see: "Crayfish port; Moreton Terrace figs", stay: "Dongara Denison Beach Holiday Park" },
  jurienbay: { n: "Jurien Bay", k: "town", f: true, d: 0.1, g: "Batavia & Turquoise coast — WA", st: "WA",
    hrs: "~6am–8pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Sea lions; the Pinnacles 20 min south at Cervantes", stay: "Jurien Bay Tourist Park" },

  /* ---- Goldfields — WA ---- */
  kalgoorlie: { n: "Kalgoorlie–Boulder", k: "city", f: true, d: 0.08, g: "Goldfields — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Super Pit lookout; Hannan Street pubs", stay: "Discovery Parks Kalgoorlie" },
  leonora: { n: "Leonora", k: "town", f: true, d: 0.2, g: "Goldfields — WA", st: "WA",
    hrs: "~6am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Gwalia ghost town & headframe", stay: "Leonora Caravan Park" },
  laverton: { n: "Laverton", k: "town", f: true, d: 0.25, g: "Goldfields — WA", st: "WA",
    hrs: "~6am–8pm", fac: ["Fuel", "Store", "Toilets"],
    see: "Western end of the Outback Way — Great Beyond centre", stay: "Laverton Caravan Park" },

  /* ---- Outback Way — Great Central Rd (unsealed) ---- */
  dockerriver: { n: "Docker River (Kaltukatjara)", k: "town", f: true, d: 0.9, g: "Outback Way — Great Central Rd", st: "NT",
    hrs: "Community store — limited hrs", fac: ["Fuel", "Store", "Toilets"],
    see: "Petermann Ranges country — permits required", stay: "Community campground" },
  warakurna: { n: "Warakurna Roadhouse", k: "rh", f: true, d: 1.0, g: "Outback Way — Great Central Rd", st: "WA",
    hrs: "Roadhouse ~8am–5pm", fac: ["Fuel", "Meals", "Toilets"],
    see: "Giles weather station tours", stay: "Warakurna Roadhouse camping" },
  warburton: { n: "Warburton Roadhouse", k: "rh", f: true, d: 1.0, g: "Outback Way — Great Central Rd", st: "WA",
    hrs: "Roadhouse ~8am–5pm", fac: ["Fuel", "Meals", "Toilets"],
    see: "Tjulyuru art gallery", stay: "Warburton Roadhouse camping" },
  tjukayirla: { n: "Tjukayirla Roadhouse", k: "rh", f: true, d: 1.1, g: "Outback Way — Great Central Rd", st: "WA",
    hrs: "Roadhouse ~8am–5pm", fac: ["Fuel", "Meals", "Toilets"],
    see: "One of Australia's remotest roadhouses", stay: "Tjukayirla Roadhouse camping" },

  /* ---- Outback Way — Plenty Hwy (unsealed) ---- */
  gemtree: { n: "Gemtree", k: "rh", f: true, d: 0.5, g: "Outback Way — Plenty Hwy", st: "NT",
    hrs: "~8am–5pm", fac: ["Fuel", "Store", "Van sites"],
    see: "Fossick your own garnets & zircons", stay: "Gemtree Caravan Park" },
  jervois: { n: "Jervois Station", k: "rh", f: true, d: 0.9, g: "Outback Way — Plenty Hwy", st: "NT",
    hrs: "Station hours — call ahead", fac: ["Fuel", "Toilets"],
    see: "Working cattle station stop", stay: "Station camping" },
  tobermorey: { n: "Tobermorey Station", k: "rh", f: true, d: 0.9, g: "Outback Way — Plenty Hwy", st: "NT",
    hrs: "Station hours — call ahead", fac: ["Fuel", "Toilets"],
    see: "Last NT stop before the QLD border", stay: "Station camping" },
  boulia: { n: "Boulia", k: "town", f: true, d: 0.3, g: "Outback Way — Plenty Hwy", st: "QLD",
    hrs: "~6am–8pm", fac: ["Fuel", "Store", "Toilets"],
    see: "Min Min light country; camel races (Jul)", stay: "Boulia Caravan Park" },
  middleton: { n: "Middleton", k: "town", f: false, d: 0.3, g: "Outback Way — Plenty Hwy", st: "QLD",
    hrs: "No fuel — pub only", fac: ["Pub", "Toilets"],
    see: "The legendary Middleton Hotel (pop. 2)", stay: "Camp beside the pub" },

  /* ---- Matilda Country — QLD ---- */
  mckinlay: { n: "McKinlay", k: "town", f: true, d: 0.2, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~7am–9pm", fac: ["Fuel", "Pub", "Toilets"],
    see: "Walkabout Creek Hotel — Crocodile Dundee's pub", stay: "Sites behind the Walkabout Creek" },
  kynuna: { n: "Kynuna", k: "town", f: true, d: 0.2, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~7am–9pm", fac: ["Fuel", "Pub", "Toilets"],
    see: "Blue Heeler Hotel; Combo Waterhole (Waltzing Matilda)", stay: "Blue Heeler sites" },
  winton: { n: "Winton", k: "town", f: true, d: 0.15, wk: true, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Waltzing Matilda Centre; dinosaur stampede at Lark Quarry", stay: "Matilda Country Tourist Park" },
  longreach: { n: "Longreach", k: "town", f: true, d: 0.12, wk: true, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Qantas Founders Museum; Stockman's Hall of Fame", stay: "Longreach Tourist Park" },
  barcaldine: { n: "Barcaldine", k: "town", f: true, d: 0.12, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Tree of Knowledge memorial", stay: "Homestead Caravan Park" },
  blackall: { n: "Blackall", k: "town", f: true, d: 0.12, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Beyond the Black Stump; historic wool scour; artesian spa", stay: "Blackall Caravan Park" },
  tambo: { n: "Tambo", k: "town", f: true, d: 0.12, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~7am–7pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Tambo Teddies workshop", stay: "Tambo Mill van sites" },
  charleville: { n: "Charleville", k: "town", f: true, d: 0.1, wk: true, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Cosmos Centre stargazing; bilby encounters", stay: "Bailey Bar Caravan Park" },
  mitchell: { n: "Mitchell", k: "town", f: true, d: 0.08, g: "Matilda Country — QLD", st: "QLD",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Great Artesian Spa — hot pools for weary towers", stay: "Major Mitchell Caravan Park" },

  /* ---- Darling Downs & the west — QLD ---- */
  roma: { n: "Roma", k: "town", f: true, d: 0.06, g: "Darling Downs & west — QLD", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Australia's biggest cattle sales (Tue/Thu); Big Rig", stay: "Big Rig Tourist Park" },
  miles: { n: "Miles", k: "town", f: true, d: 0.05, g: "Darling Downs & west — QLD", st: "QLD",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Historical Village; wildflowers (Sep)", stay: "Possum Park (WWII bunkers)" },
  dalby: { n: "Dalby", k: "town", f: true, d: 0.03, g: "Darling Downs & west — QLD", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Darling Downs grain country", stay: "Myall Creek parks" },
  toowoomba: { n: "Toowoomba", k: "city", f: true, d: 0, g: "Darling Downs & west — QLD", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "All services"],
    see: "Picnic Point over the range; Carnival of Flowers (Sep)", stay: "Toowoomba Showgrounds RV park" },

  /* ---- Central highlands — QLD ---- */
  emerald: { n: "Emerald", k: "town", f: true, d: 0.06, g: "Central highlands — QLD", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Gemfields fossicking (sapphires) 45 min west", stay: "Lake Maraboon Holiday Village" },

  /* ---- Great Ocean Road — VIC ---- */
  torquay: { n: "Torquay", k: "town", f: true, d: 0.02, wk: true, g: "Great Ocean Road — VIC", st: "VIC",
    hrs: "~5am–10pm", fac: ["Fuel", "Supermarkets", "Toilets"],
    see: "Bells Beach; surf museum; the GOR's front door", stay: "Torquay Foreshore Caravan Park" },
  apollobay: { n: "Apollo Bay", k: "town", f: true, d: 0.08, wk: true, g: "Great Ocean Road — VIC", st: "VIC",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Toilets"],
    see: "Harbour town under the Otways; Maits Rest rainforest walk", stay: "Apollo Bay Holiday Park" },
  portcampbell: { n: "Port Campbell", k: "town", f: true, d: 0.1, wk: true, g: "Great Ocean Road — VIC", st: "VIC",
    hrs: "~7am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Twelve Apostles & Loch Ard Gorge on the doorstep", stay: "Port Campbell Holiday Park" },
  warrnambool: { n: "Warrnambool", k: "town", f: true, d: 0.03, wk: true, g: "Great Ocean Road — VIC", st: "VIC",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Southern right whales at Logans Beach (Jun–Sep)", stay: "Surfside Holiday Park" },
  portfairy: { n: "Port Fairy", k: "town", f: true, d: 0.05, g: "Great Ocean Road — VIC", st: "VIC",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Bakery"],
    see: "Whalers&rsquo; cottages; Griffiths Island lighthouse walk", stay: "Gardens Caravan Park" },
  portland: { n: "Portland", k: "town", f: true, d: 0.04, g: "Great Ocean Road — VIC", st: "VIC",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarket", "Dump point"],
    see: "Victoria&rsquo;s first settlement; cable tram; gannet colony", stay: "NRMA Portland Bay" },

  /* ---- Limestone Coast — SA ---- */
  mtgambier: { n: "Mount Gambier", k: "town", f: true, d: 0.03, wk: true, g: "Limestone Coast — SA", st: "SA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "The Blue Lake (best Nov–Mar); Umpherston Sinkhole", stay: "BIG4 Blue Lake Holiday Park" },
  robe: { n: "Robe", k: "town", f: true, d: 0.08, wk: true, g: "Limestone Coast — SA", st: "SA",
    hrs: "~6am–9pm", fac: ["Fuel", "Supermarket", "Bakery"],
    see: "The Obelisk; famous doughnut van; Long Beach drive", stay: "Discovery Parks Robe" },
  meningie: { n: "Meningie", k: "town", f: true, d: 0.06, g: "Limestone Coast — SA", st: "SA",
    hrs: "~6am–8pm", fac: ["Fuel", "Food", "Toilets"],
    see: "Lake Albert pelicans; the Coorong&rsquo;s dune country", stay: "Lake Albert Caravan Park" },
  /* ---- v0.26: south-west WA ---- */
  bunbury: { n: "Bunbury", k: "city", f: true, d: 0.02, g: "South West — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Dolphins at Koombana Bay; the Bunbury back beach", stay: "Discovery Parks Bunbury" },
  busselton: { n: "Busselton", k: "town", f: true, d: 0.05, g: "South West — WA", st: "WA",
    hrs: "Fuel ~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "The 1.8 km jetty and its underwater observatory", stay: "RAC Busselton Holiday Park" },
  margaretriver: { n: "Margaret River", k: "town", f: true, d: 0.08, wk: true, g: "South West — WA", st: "WA",
    hrs: "Fuel ~6am–9pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Wineries, surf breaks, and caves all within 20 minutes", stay: "Riverview Tourist Park" },
  pemberton: { n: "Pemberton", k: "town", f: true, d: 0.1, g: "South West — WA", st: "WA",
    hrs: "Fuel ~7am–7pm", fac: ["Fuel", "General store"],
    see: "Climb the Gloucester Tree if your nerve holds; karri forest drives", stay: "Pemberton Caravan Park" },
  walpole: { n: "Walpole", k: "town", f: true, d: 0.12, g: "South Coast — WA", st: "WA",
    hrs: "Fuel ~7am–6pm", fac: ["Fuel", "General store"],
    see: "Valley of the Giants Tree Top Walk among the tingles", stay: "Coalmine Beach Holiday Park" },
  denmark: { n: "Denmark", k: "town", f: true, d: 0.1, g: "South Coast — WA", st: "WA",
    hrs: "Fuel ~6am–8pm", fac: ["Fuel", "Supermarket"],
    see: "Greens Pool and Elephant Rocks — the photos are real", stay: "Denmark Rivermouth Caravan Park" },
  albany: { n: "Albany", k: "town", f: true, d: 0.06, wk: true, g: "South Coast — WA", st: "WA",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "The Gap and Natural Bridge; National Anzac Centre", stay: "BIG4 Emu Beach" },
  esperance: { n: "Esperance", k: "town", f: true, d: 0.12, g: "Goldfields-Esperance — WA", st: "WA",
    hrs: "Fuel ~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Lucky Bay — kangaroos on squeaky white sand", stay: "RAC Esperance Holiday Park" },
  /* ---- v0.26: Top End ---- */
  batchelor: { n: "Batchelor (Litchfield)", k: "town", f: true, d: 0.2, g: "Top End — NT", st: "NT",
    hrs: "Fuel ~7am–7pm", fac: ["Fuel", "General store"],
    see: "Litchfield: Florence and Wangi falls, Buley Rockhole", stay: "Litchfield Tourist Park" },
  jabiru: { n: "Jabiru (Kakadu)", k: "town", f: true, d: 0.3, g: "Kakadu — NT", st: "NT",
    hrs: "Fuel ~6am–8pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Ubirr rock art and that floodplain sunset; park pass required", stay: "Anbinik Kakadu Resort" },
  cooinda: { n: "Cooinda (Yellow Water)", k: "rh", f: true, d: 0.35, g: "Kakadu — NT", st: "NT",
    hrs: "Fuel ~7am–7pm", fac: ["Fuel", "Meals", "Van sites"],
    see: "Yellow Water cruise at dawn — crocs, brolgas, lotus", stay: "Cooinda Lodge campground" },
  pinecreek: { n: "Pine Creek", k: "town", f: true, d: 0.25, g: "Stuart Hwy — NT", st: "NT",
    hrs: "Fuel ~7am–7pm", fac: ["Fuel", "General store"],
    see: "Gold-rush relics; the back door to Kakadu", stay: "Lazy Lizard Caravan Park" },
  /* ---- v0.26: the Gibb ---- */
  imintji: { n: "Imintji", k: "rh", f: true, d: 0.75, g: "Gibb River Rd — WA", st: "WA",
    hrs: "Store ~8am–4pm (dry season)", fac: ["Fuel", "Store", "Camp"],
    see: "Gateway to Bell Gorge — the Gibb\u2019s first great swim", stay: "Imintji Campground" },
  mtbarnett: { n: "Mt Barnett", k: "rh", f: true, d: 0.85, g: "Gibb River Rd — WA", st: "WA",
    hrs: "Roadhouse ~7am–5pm (dry season)", fac: ["Fuel", "Store", "Camp"],
    see: "Manning Gorge walk and waterhole from the campground", stay: "Manning Gorge campground" },
  ellenbrae: { n: "Ellenbrae Station", k: "rh", f: false, d: 0, g: "Gibb River Rd — WA", st: "WA",
    hrs: "Scones ~8am–4pm (dry season)", fac: ["Famous scones", "Camp"],
    see: "The scone stop of the Kimberley — 70,000 a season", stay: "Ellenbrae station camp" },
  elquestro: { n: "El Questro", k: "town", f: true, d: 0.6, g: "Gibb River Rd — WA", st: "WA",
    hrs: "Station hours (dry season)", fac: ["Fuel", "Meals", "Camp"],
    see: "Emma Gorge, Zebedee springs, El Questro Gorge", stay: "El Questro Station township" },
  /* ---- v0.26: Gulf Savannah ---- */
  borroloola: { n: "Borroloola", k: "town", f: true, d: 0.4, g: "Gulf — NT", st: "NT",
    hrs: "Fuel ~7am–7pm", fac: ["Fuel", "Store", "Dump point"],
    see: "King Ash Bay fishing; barra country proper", stay: "McArthur River Caravan Park" },
  hellsgate: { n: "Hells Gate", k: "rh", f: true, d: 0.6, g: "Savannah Way — QLD", st: "QLD",
    hrs: "Roadhouse ~7am–6pm (dry)", fac: ["Fuel", "Meals", "Camp"],
    see: "The border roadhouse — last fuel into the NT gulf", stay: "Hells Gate Roadhouse camp" },
  burketown: { n: "Burketown", k: "town", f: true, d: 0.45, g: "Gulf — QLD", st: "QLD",
    hrs: "Fuel ~7am–6pm", fac: ["Fuel", "Store", "Dump point"],
    see: "Morning Glory clouds (Sep–Nov); barramundi capital claims", stay: "Savannah Lodge Burketown" },
  normanton: { n: "Normanton", k: "town", f: true, d: 0.35, g: "Gulf — QLD", st: "QLD",
    hrs: "Fuel ~6am–8pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Krys the 8.6 m croc replica; the Gulflander railmotor", stay: "Normanton Tourist Park" },
  karumba: { n: "Karumba", k: "town", f: true, d: 0.35, g: "Gulf — QLD", st: "QLD",
    hrs: "Fuel ~7am–6pm", fac: ["Fuel", "Store", "Dump point"],
    see: "The only Gulf town on the water — sunset over the sea, prawns in hand", stay: "Karumba Point Sunset Caravan Park" },
  croydon: { n: "Croydon", k: "town", f: true, d: 0.3, g: "Savannah Way — QLD", st: "QLD",
    hrs: "Fuel ~7am–6pm", fac: ["Fuel", "Store"],
    see: "Gold-rush streetscape kept honest", stay: "Croydon Caravan Park" },
  georgetown: { n: "Georgetown", k: "town", f: true, d: 0.3, g: "Savannah Way — QLD", st: "QLD",
    hrs: "Fuel ~7am–7pm", fac: ["Fuel", "Store"],
    see: "Terrestrial gem and mineral collection — better than it sounds", stay: "Goldfields Caravan Park" },
  mtsurprise: { n: "Mount Surprise", k: "town", f: true, d: 0.3, g: "Savannah Way — QLD", st: "QLD",
    hrs: "Fuel ~7am–6pm", fac: ["Fuel", "Store", "Camp"],
    see: "Undara lava tubes just down the road — book the tour", stay: "Bedrock Village Caravan Park" },
  atherton: { n: "Atherton", k: "town", f: true, d: 0.1, g: "Tablelands — QLD", st: "QLD",
    hrs: "Fuel ~6am–9pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Waterfall circuit, curtain fig, platypus at Yungaburra", stay: "Atherton Halloran\u2019s Leisure Park" },
  /* ---- v0.26: Cape York ---- */
  mareeba: { n: "Mareeba", k: "town", f: true, d: 0.08, g: "Tablelands — QLD", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Coffee farms and rodeo country at the top of the range", stay: "Riverside Tourist Park" },
  laura: { n: "Laura", k: "town", f: true, d: 0.35, g: "Cape York — QLD", st: "QLD",
    hrs: "Fuel ~8am–5pm", fac: ["Fuel", "Store"],
    see: "Split Rock gallery — Quinkan rock art, world class", stay: "Laura campground" },
  coen: { n: "Coen", k: "town", f: true, d: 0.45, g: "Cape York — QLD", st: "QLD",
    hrs: "Fuel ~7am–6pm (dry)", fac: ["Fuel", "Store", "Camp"],
    see: "The Cape\u2019s halfway town — check the Peninsula road report here", stay: "Coen riverside camp" },
  archerriver: { n: "Archer River", k: "rh", f: true, d: 0.55, g: "Cape York — QLD", st: "QLD",
    hrs: "Roadhouse ~7am–7pm (dry)", fac: ["Fuel", "Famous burgers", "Camp"],
    see: "The Archer burger is a rite of passage", stay: "Archer River Roadhouse camp" },
  bramwell: { n: "Bramwell Junction", k: "rh", f: true, d: 0.6, g: "Cape York — QLD", st: "QLD",
    hrs: "Roadhouse ~7am–6pm (dry)", fac: ["Fuel", "Meals", "Camp"],
    see: "Where the Old Telegraph Track begins — watch the crossings from the safe side", stay: "Bramwell Junction camp" },
  bamaga: { n: "Bamaga (The Tip)", k: "town", f: true, d: 0.55, g: "Cape York — QLD", st: "QLD",
    hrs: "Fuel ~7am–6pm", fac: ["Fuel", "Supermarket", "Camp"],
    see: "Stand at the northernmost point of the continent — Pajinka, the Tip itself", stay: "Loyalty Beach campground" },
  /* ---- v0.26: New England & outback NSW ---- */
  dubbo: { n: "Dubbo", k: "city", f: true, d: 0.05, wk: true, g: "Central West — NSW", st: "NSW",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Taronga Western Plains Zoo — worth the trip alone", stay: "Dubbo Holiday Park" },
  nyngan: { n: "Nyngan", k: "town", f: true, d: 0.12, g: "Outback NSW", st: "NSW",
    hrs: "Fuel ~6am–9pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "The Big Bogan, photographed without irony", stay: "Nyngan Riverside Tourist Park" },
  bourke: { n: "Bourke", k: "town", f: true, d: 0.18, g: "Outback NSW", st: "NSW",
    hrs: "Fuel ~6am–8pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Back O\u2019 Bourke Exhibition Centre; Darling River sunsets", stay: "Kidman\u2019s Camp" },
  lightningridge: { n: "Lightning Ridge", k: "town", f: true, d: 0.18, g: "Outback NSW", st: "NSW",
    hrs: "Fuel ~6am–8pm", fac: ["Fuel", "Supermarket", "Dump point"],
    see: "Black opal mines, artesian bore baths at midnight, car-door tours", stay: "Opal Caravan Park" },
  moree: { n: "Moree", k: "town", f: true, d: 0.1, g: "North West — NSW", st: "NSW",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Hot artesian pools — the grey nomad wintering hole", stay: "Gwydir Thermal Pools Holiday Park" },
  goondiwindi: { n: "Goondiwindi", k: "town", f: true, d: 0.08, g: "Border — QLD", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Gunsynd the Goondiwindi Grey; Macintyre River walk", stay: "Goondiwindi Holiday Park" },
  tamworth: { n: "Tamworth", k: "city", f: true, d: 0.05, g: "New England — NSW", st: "NSW",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "The Golden Guitar; country music capital swagger", stay: "Paradise Tourist Park" },
  armidale: { n: "Armidale", k: "town", f: true, d: 0.08, g: "New England — NSW", st: "NSW",
    hrs: "Fuel ~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Autumn colour, cathedral city, waterfalls out east", stay: "Armidale Tourist Park" },
  tenterfield: { n: "Tenterfield", k: "town", f: true, d: 0.12, g: "New England — NSW", st: "NSW",
    hrs: "Fuel ~6am–9pm", fac: ["Fuel", "Supermarket"],
    see: "The Saddler, of the song; Bald Rock nearby", stay: "Tenterfield Lodge Caravan Park" },
  warwick: { n: "Warwick", k: "town", f: true, d: 0.08, g: "Southern Downs — QLD", st: "QLD",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Rose city rodeo country; Girraween granite an hour south", stay: "BIG4 Warwick" },
  /* ---- v0.26: Princes Hwy coast ---- */
  nowra: { n: "Nowra", k: "town", f: true, d: 0.05, g: "Shoalhaven — NSW", st: "NSW",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Jervis Bay\u2019s white sand 20 minutes east — Hyams Beach", stay: "Shoalhaven Caravan Village" },
  batemansbay: { n: "Batemans Bay", k: "town", f: true, d: 0.06, wk: true, g: "Eurobodalla — NSW", st: "NSW",
    hrs: "Fuel ~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Oysters off the leases; Murramarang kangaroo beaches", stay: "BIG4 Batemans Bay" },
  merimbula: { n: "Merimbula", k: "town", f: true, d: 0.08, g: "Sapphire Coast — NSW", st: "NSW",
    hrs: "Fuel ~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Whales (Sep–Nov), boardwalk over the lake, Eden\u2019s killer whale museum south", stay: "NRMA Merimbula Beach" },
  lakesentrance: { n: "Lakes Entrance", k: "town", f: true, d: 0.08, wk: true, g: "Gippsland — VIC", st: "VIC",
    hrs: "Fuel ~5am–10pm", fac: ["Fuel", "Supermarkets", "Dump point"],
    see: "Ninety Mile Beach meets the Gippsland Lakes; fresh fish co-op", stay: "BIG4 Whiters Lakes Entrance" },
  sale: { n: "Sale", k: "town", f: true, d: 0.05, g: "Gippsland — VIC", st: "VIC",
    hrs: "24 hr fuel", fac: ["24 hr fuel", "Supermarkets", "Dump point"],
    see: "Port of Sale arts precinct; wetlands boardwalk", stay: "Marlay Point / Sale Motor Village" },

};

const EDGES = [
  ["adelaide","ptwakefield",95,"r"], ["ptwakefield","ptpirie",128,"f"], ["ptpirie","ptaugusta",87,"f"],
  ["ptaugusta","pimba",175,"f"], ["pimba","glendambo",113,"f"], ["glendambo","cooberpedy",253,"f"],
  ["cooberpedy","cadney",152,"f"], ["cadney","marla",82,"f"], ["marla","kulgera",180,"f"],
  ["kulgera","erldunda",74,"f"], ["erldunda","alicesprings",199,"f"],
  ["erldunda","curtin",159,"f"], ["curtin","yulara",85,"f"],
  ["alicesprings","titree",193,"f"], ["titree","barrowck",90,"f"],
  ["barrowck","wauchope",109,"f"], ["wauchope","tennant",114,"f"],
  ["tennant","renner",160,"f"], ["renner","elliott",91,"f"], ["elliott","dunmarra",92,"f"],
  ["dunmarra","dalywaters",48,"f"], ["dalywaters","mataranka",160,"f"], ["mataranka","katherine",106,"f"],
  ["katherine","adelriver",203,"f"], ["adelriver","darwin",114,"f"],
  ["ptaugusta","ironknob",68,"f"], ["ironknob","kimba",88,"f"], ["kimba","wudinna",101,"f"],
  ["wudinna","ceduna",211,"f"], ["ceduna","penong",73,"f"], ["penong","nundroo",78,"f"],
  ["nundroo","nullarborrh",146,"f"], ["nullarborrh","bordervillage",184,"f"], ["bordervillage","eucla",13,"f"],
  ["eucla","mundrabilla",66,"f"], ["mundrabilla","madura",116,"f"], ["madura","cocklebiddy",92,"f"],
  ["cocklebiddy","caiguna",66,"f"], ["caiguna","balladonia",182,"f"], ["balladonia","norseman",191,"r"],
  ["norseman","coolgardie",161,"f"], ["coolgardie","southerncross",187,"f"], ["southerncross","merredin",109,"f"],
  ["merredin","northam",163,"r"], ["northam","perth",97,"r"],
  ["adelaide","murraybridge",76,"h"], ["murraybridge","tailembend",24,"f"], ["tailembend","keith",110,"f"],
  ["keith","bordertown",44,"f"], ["bordertown","nhill",112,"f"], ["nhill","horsham",72,"f"],
  ["horsham","ararat",90,"r"], ["ararat","ballarat",88,"r"], ["ballarat","melbourne",110,"r"],
  ["adelaide","waikerie",177,"r"], ["waikerie","renmark",65,"f"], ["renmark","mildura",142,"f"],
  ["mildura","euston",79,"f"], ["euston","balranald",81,"f"], ["balranald","hay",134,"f"],
  ["hay","narrandera",180,"f"], ["narrandera","wagga",99,"f"], ["wagga","gundagai",77,"r"],
  ["gundagai","yass",105,"r"], ["yass","goulburn",88,"r"], ["goulburn","sydney",195,"h"],
  ["ptaugusta","quorn",41,"r"], ["quorn","hawker",66,"r"], ["hawker","wilpena",53,"h"],
  ["melbourne","seymour",98,"r"], ["seymour","benalla",90,"f"], ["benalla","wangaratta",42,"f"],
  ["wangaratta","albury",72,"f"], ["albury","holbrook",63,"r"], ["holbrook","gundagai",118,"r"],
  ["adelaide","burra",156,"r"], ["burra","peterborough",76,"r"], ["peterborough","yunta",78,"f"],
  ["yunta","brokenhill",200,"f"], ["brokenhill","wentworth",265,"f"], ["wentworth","mildura",32,"f"],
  ["adelaide","victorharbor",82,"h"],
  ["sydney","newcastle",160,"f"], ["newcastle","portmacquarie",236,"f"],
  ["portmacquarie","coffsharbour",154,"f"], ["coffsharbour","grafton",83,"r"],
  ["grafton","ballina",128,"f"], ["ballina","goldcoast",108,"f"], ["goldcoast","brisbane",79,"f"],
  ["brisbane","sunshinecoast",104,"f"], ["sunshinecoast","gympie",77,"r"], ["gympie","maryborough",92,"r"],
  ["maryborough","bundaberg",112,"r"], ["bundaberg","gladstone",174,"r"], ["gladstone","rockhampton",107,"f"],
  ["rockhampton","mackay",334,"f"], ["mackay","proserpine",124,"f"], ["proserpine","bowen",63,"f"],
  ["bowen","townsville",197,"f"], ["townsville","cardwell",164,"f"], ["cardwell","innisfail",79,"r"],
  ["innisfail","cairns",88,"r"],
  ["tennant","barklyhs",186,"f"], ["barklyhs","camooweal",262,"f"], ["camooweal","mtisa",188,"f"],
  ["mtisa","cloncurry",118,"f"], ["cloncurry","juliacreek",137,"f"], ["juliacreek","richmondq",144,"f"],
  ["richmondq","hughenden",113,"f"], ["hughenden","charterstowers",243,"f"], ["charterstowers","townsville",134,"f"],
  ["yass","canberra",60,"r"], ["goulburn","canberra",92,"r"],
  ["melbourne","geelong",75,"f"], ["geelong","devonport",431,"y"],
  ["devonport","burnie",49,"f"], ["burnie","stanley",80,"r"], ["devonport","sheffield",30,"r"],
  ["sheffield","launceston",78,"r"], ["devonport","launceston",99,"f"],
  ["launceston","sthelens",163,"h"], ["sthelens","bicheno",76,"r"], ["bicheno","swansea",46,"r"],
  ["swansea","triabunna",52,"r"], ["triabunna","sorell",58,"r"], ["sorell","hobart",26,"f"],
  ["sorell","portarthur",74,"r"], ["launceston","oatlands",132,"f"], ["oatlands","hobart",84,"f"],
  ["hobart","hamiltontas",73,"r"], ["hamiltontas","derwentbridge",100,"h"], ["derwentbridge","queenstown",86,"h"],
  ["queenstown","strahan",40,"h"], ["queenstown","rosebery",53,"h"], ["rosebery","burnie",105,"h"],
  ["katherine","victoriariver",194,"f"], ["victoriariver","timbercreek",91,"f"],
  ["timbercreek","kununurra",225,"f"], ["kununurra","warmun",197,"r"], ["warmun","hallscreek",161,"r"],
  ["hallscreek","fitzroycrossing",288,"f"], ["fitzroycrossing","willare",254,"f"],
  ["willare","derby",55,"f"], ["willare","broome",172,"f"],
  ["broome","sandfire",305,"f"], ["sandfire","pardoo",152,"f"], ["pardoo","porthedland",148,"f"],
  ["porthedland","roebourne",202,"f"], ["roebourne","karratha",40,"f"], ["karratha","nanutarra",275,"f"],
  ["nanutarra","minilya",227,"f"], ["minilya","coralbay",96,"f"], ["coralbay","exmouth",152,"f"],
  ["minilya","carnarvon",142,"f"], ["carnarvon","overlander",202,"f"], ["overlander","northampton",232,"f"],
  ["northampton","kalbarri",102,"r"], ["northampton","geraldton",51,"f"], ["geraldton","dongara",65,"f"],
  ["dongara","jurienbay",110,"f"], ["jurienbay","perth",220,"f"],
  ["coolgardie","kalgoorlie",39,"f"], ["kalgoorlie","leonora",237,"f"], ["leonora","laverton",124,"f"],
  ["yulara","dockerriver",231,"u"], ["dockerriver","warakurna",106,"u"], ["warakurna","warburton",228,"u"],
  ["warburton","tjukayirla",247,"u"], ["tjukayirla","laverton",296,"u"],
  ["alicesprings","gemtree",140,"f"], ["gemtree","jervois",205,"u"], ["jervois","tobermorey",252,"u"],
  ["tobermorey","boulia",246,"u"], ["boulia","middleton",194,"r"], ["middleton","winton",169,"r"],
  ["cloncurry","mckinlay",107,"f"], ["mckinlay","kynuna",74,"f"], ["kynuna","winton",166,"f"],
  ["winton","longreach",180,"f"], ["longreach","barcaldine",108,"f"], ["barcaldine","blackall",107,"f"],
  ["blackall","tambo",100,"f"], ["tambo","charleville",200,"f"], ["charleville","mitchell",178,"f"],
  ["mitchell","roma",88,"f"], ["roma","miles",141,"f"], ["miles","dalby",129,"f"],
  ["dalby","toowoomba",84,"f"], ["toowoomba","brisbane",127,"h"],
  ["barcaldine","emerald",307,"f"], ["emerald","rockhampton",270,"f"],
  ["geelong","torquay",24,"r"], ["torquay","apollobay",91,"h"], ["apollobay","portcampbell",98,"h"],
  ["portcampbell","warrnambool",66,"r"], ["warrnambool","portfairy",28,"f"], ["portfairy","portland",72,"r"],
  ["portland","mtgambier",105,"f"], ["mtgambier","robe",130,"r"], ["robe","meningie",192,"f"],
  ["meningie","tailembend",60,"f"],
  /* v0.26: south-west WA */
  ["perth","bunbury",175,"f"], ["bunbury","busselton",53,"f"], ["busselton","margaretriver",48,"r"],
  ["margaretriver","pemberton",130,"r"], ["pemberton","walpole",120,"r"], ["walpole","denmark",66,"r"],
  ["denmark","albany",55,"r"], ["albany","esperance",480,"r"], ["esperance","norseman",205,"r"],
  /* v0.26: Top End */
  ["darwin","batchelor",98,"f"], ["darwin","jabiru",255,"r"], ["jabiru","cooinda",55,"r"],
  ["cooinda","pinecreek",160,"r"], ["pinecreek","katherine",90,"f"], ["batchelor","pinecreek",135,"r"],
  /* v0.26: the Gibb (dry season, corrugations — check conditions) */
  ["derby","imintji",227,"u"], ["imintji","mtbarnett",79,"u"], ["mtbarnett","ellenbrae",140,"u"],
  ["ellenbrae","elquestro",130,"u"], ["elquestro","kununurra",110,"u"],
  /* v0.26: Gulf Savannah */
  ["dalywaters","borroloola",380,"r"], ["borroloola","hellsgate",320,"u"], ["hellsgate","burketown",170,"u"],
  ["burketown","normanton",230,"u"], ["normanton","karumba",70,"r"], ["normanton","croydon",150,"r"],
  ["croydon","georgetown",148,"r"], ["georgetown","mtsurprise",92,"r"], ["mtsurprise","atherton",150,"r"],
  ["atherton","cairns",90,"h"], ["atherton","mareeba",30,"f"],
  /* v0.26: Cape York (dry season; Jardine ferry before Bamaga) */
  ["cairns","mareeba",64,"h"], ["mareeba","laura",250,"r"], ["laura","coen",245,"u"],
  ["coen","archerriver",65,"u"], ["archerriver","bramwell",175,"u"], ["bramwell","bamaga",200,"u"],
  /* v0.26: New England & outback NSW */
  ["sydney","dubbo",390,"h"], ["dubbo","nyngan",165,"f"], ["nyngan","bourke",200,"f"],
  ["moree","lightningridge",190,"r"], ["moree","goondiwindi",120,"f"], ["goondiwindi","toowoomba",225,"f"],
  ["moree","tamworth",285,"f"], ["newcastle","tamworth",285,"h"], ["tamworth","armidale",110,"h"],
  ["armidale","tenterfield",180,"h"], ["tenterfield","warwick",105,"h"], ["warwick","toowoomba",85,"f"],
  /* v0.26: Princes Hwy coast */
  ["sydney","nowra",160,"h"], ["nowra","batemansbay",110,"h"], ["batemansbay","merimbula",175,"h"],
  ["merimbula","lakesentrance",280,"h"], ["lakesentrance","sale",70,"f"], ["sale","melbourne",215,"f"],

];

const ADJ = {};
EDGES.forEach(([a, b, km, t]) => {
  (ADJ[a] = ADJ[a] || []).push({ to: b, km, t });
  (ADJ[b] = ADJ[b] || []).push({ to: a, km, t });
});

function findPath(from, to) {
  const dist = {}, prev = {}, done = {};
  Object.keys(NODES).forEach((id) => (dist[id] = Infinity));
  dist[from] = 0;
  for (;;) {
    let u = null;
    Object.keys(dist).forEach((id) => {
      if (!done[id] && dist[id] < (u === null ? Infinity : dist[u])) u = id;
    });
    if (u === null || u === to) break;
    done[u] = true;
    (ADJ[u] || []).forEach((e) => {
      /* Route choice prefers bitumen: unsealed legs cost 1.4x their km when
         picking a path, so dirt only wins where it genuinely earns it
         (e.g. the Outback Way). Displayed km and fuel stay real. */
      const w = dist[u] + e.km * (e.t === "u" ? 1.4 : 1);
      if (w < dist[e.to]) { dist[e.to] = w; prev[e.to] = u; }
    });
  }
  if (dist[to] === Infinity) return null;
  const ids = [to];
  while (ids[0] !== from) ids.unshift(prev[ids[0]]);
  return ids;
}

/* ============ Share-a-Trip: the plan travels inside the link ============ */

const encodeTrip = (w, s, m) => {
  try {
    const json = JSON.stringify({ w, s: s || {}, m: m || null });
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e) { return null; }
};
const decodeTrip = (code) => {
  try {
    const b = code.replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(decodeURIComponent(escape(atob(b))));
    if (!obj || !Array.isArray(obj.w)) return null;
    const w = obj.w.filter((id) => NODES[id]);
    if (w.length < 2) return null;
    const s = {};
    if (obj.s && typeof obj.s === "object") {
      Object.keys(obj.s).forEach((id) => {
        if (NODES[id]) s[id] = Math.max(0, Math.min(30, Number(obj.s[id]) || 0));
      });
    }
    const m = obj.m && obj.m.start && obj.m.end && NODES[obj.m.start] && NODES[obj.m.end]
      ? { start: obj.m.start, end: obj.m.end } : null;
    return { w, s, m };
  } catch (e) { return null; }
};

/* ============ Community layer: kinds, handles, ages ============ */

const REPORT_KINDS = [
  ["closed", "🚧 Road closed"],
  ["water", "🌊 Water over road"],
  ["works", "🚜 Roadworks"],
  ["fuel", "⛽ Fuel price alert"],
  ["clear", "✅ All clear"],
];
const REPORT_LABEL = Object.fromEntries(REPORT_KINDS);

const HANDLE_A = ["Sandy", "Dusty", "Salty", "Sunny", "Rusty", "Windy", "Lucky", "Rocky", "Misty", "Bluey"];
const HANDLE_B = ["Wombat", "Galah", "Dingo", "Quokka", "Emu", "Roo", "Brolga", "Barra", "Cocky", "Bilby"];
const makeHandle = () =>
  HANDLE_A[Math.floor(Math.random() * HANDLE_A.length)] +
  HANDLE_B[Math.floor(Math.random() * HANDLE_B.length)] +
  String(10 + Math.floor(Math.random() * 90));

const daysAgo = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago";
};
const isFresh = (iso, days) => {
  const d = Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);
  return d <= days;
};

/* ============ My Australia: scratch map + badges ============ */

const corridorIds = (pairs) => {
  const set = new Set();
  pairs.forEach(([a, b]) => {
    const p = findPath(a, b);
    if (p) p.forEach((id) => set.add(id));
  });
  return [...set];
};

const BADGE_ROUTES = {
  nullarbor: corridorIds([["ceduna", "norseman"]]),
  stuart: corridorIds([["ptaugusta", "darwin"]]),
  east: corridorIds([["sydney", "cairns"]]),
  west: corridorIds([["broome", "perth"]]),
  tassie: corridorIds([["devonport", "strahan"], ["strahan", "hobart"], ["hobart", "sthelens"], ["sthelens", "devonport"]]),
  outbackway: corridorIds([["winton", "laverton"]]),
  biglap: corridorIds([["adelaide", "melbourne"], ["melbourne", "sydney"], ["sydney", "brisbane"],
    ["brisbane", "cairns"], ["cairns", "darwin"], ["darwin", "broome"], ["broome", "perth"], ["perth", "adelaide"]]),
  thetip: corridorIds([["cairns", "bamaga"]]),
  gibb: corridorIds([["derby", "imintji"], ["imintji", "mtbarnett"], ["mtbarnett", "ellenbrae"],
    ["ellenbrae", "elquestro"], ["elquestro", "kununurra"]]), /* pinned to the dirt — the highway must not earn this badge */
  savannah: corridorIds([["katherine", "burketown"], ["burketown", "cairns"]]),
};

const BADGES = [
  { id: "first", emoji: "🚩", name: "First Tracks", hint: "Mark your first stop visited",
    test: (vis) => vis.size >= 1 },
  { id: "ten", emoji: "🏘️", name: "Ten Towns", hint: "Visit 10 stops",
    test: (vis) => vis.size >= 10 },
  { id: "fifty", emoji: "🛻", name: "Half Century", hint: "Visit 50 stops",
    test: (vis) => vis.size >= 50 },
  { id: "hundred", emoji: "🌏", name: "The Hundred Club", hint: "Visit 100 stops",
    test: (vis) => vis.size >= 100 },
  { id: "all", emoji: "🗺️", name: "The Full Map", hint: "Visit every stop on the network",
    test: (vis) => vis.size >= Object.keys(NODES).length },
  { id: "nullarbor", emoji: "🐫", name: "Nullarbor Crossed", hint: "Cross from Ceduna to Norseman",
    test: (vis) => BADGE_ROUTES.nullarbor.every((id) => vis.has(id)) },
  { id: "stuart", emoji: "🧭", name: "Up the Guts", hint: "Port Augusta to Darwin on the Stuart",
    test: (vis) => BADGE_ROUTES.stuart.every((id) => vis.has(id)) },
  { id: "east", emoji: "🏖️", name: "East Coast Classic", hint: "Sydney to Cairns, the long way up",
    test: (vis) => BADGE_ROUTES.east.every((id) => vis.has(id)) },
  { id: "west", emoji: "🦈", name: "The Wild West", hint: "Broome to Perth down the coast",
    test: (vis) => BADGE_ROUTES.west.every((id) => vis.has(id)) },
  { id: "tassie", emoji: "🍎", name: "Lap of Tassie", hint: "Circumnavigate Tasmania",
    test: (vis) => BADGE_ROUTES.tassie.every((id) => vis.has(id)) },
  { id: "outbackway", emoji: "🤠", name: "The Longest Shortcut", hint: "Winton to Laverton on the Outback Way",
    test: (vis) => BADGE_ROUTES.outbackway.every((id) => vis.has(id)) },
  { id: "biglap", emoji: "🏆", name: "Big Lap Legend", hint: "The full ring around Australia",
    test: (vis) => BADGE_ROUTES.biglap.every((id) => vis.has(id)) },
  { id: "states", emoji: "🎖️", name: "All Eight", hint: "Visit every state & territory",
    test: (vis) => {
      const st = new Set();
      vis.forEach((id) => { if (NODES[id]) st.add(NODES[id].st); });
      return st.size >= STATE_GROUPS.length;
    } },
  { id: "roadhouse", emoji: "⛽", name: "Roadhouse Royalty", hint: "Visit 10 outback roadhouses",
    test: (vis) => {
      let n = 0;
      vis.forEach((id) => { if (NODES[id] && NODES[id].k === "rh") n += 1; });
      return n >= 10;
    } },
  { id: "thetip", emoji: "🏁", name: "Made It To The Tip", hint: "Cairns to Bamaga up the Peninsula",
    test: (vis) => BADGE_ROUTES.thetip.every((id) => vis.has(id)) },
  { id: "gibb", emoji: "🏞️", name: "Gibb River Legend", hint: "Derby to Kununurra the corrugated way",
    test: (vis) => BADGE_ROUTES.gibb.every((id) => vis.has(id)) },
  { id: "savannah", emoji: "🐊", name: "Savannah Wayfarer", hint: "Katherine to Cairns through the Gulf",
    test: (vis) => BADGE_ROUTES.savannah.every((id) => vis.has(id)) },
  { id: "scribe", emoji: "📝", name: "Trip Scribe", hint: "Write journal notes at 5 stops",
    test: (vis, jx) => !!jx && jx.notes >= 5 },
  { id: "snaps", emoji: "📷", name: "Snapshot Collector", hint: "Add 10 photos to your journal",
    test: (vis, jx) => !!jx && jx.photos >= 10 },
];

function ScratchSketch({ visited }) {
  return (
    <svg viewBox={"0 0 " + SK_W + " " + SK_H} role="img"
         aria-label="Map of the JourneyPro network showing the stops and highways you have travelled"
         style={{ width: "100%", height: "auto", display: "block", background: "var(--paper)",
                  border: "1.5px solid var(--line)", borderRadius: 12 }}>
      {EDGES.map(([a, b], i) => {
        const done = visited[a] && visited[b];
        return (
          <line key={i} x1={SKETCH_PTS[a][0]} y1={SKETCH_PTS[a][1]}
                x2={SKETCH_PTS[b][0]} y2={SKETCH_PTS[b][1]}
                stroke={done ? "var(--sign)" : "#D8D7CC"} strokeWidth={done ? 2.8 : 1.4}
                strokeDasharray={done ? undefined : "4 4"} strokeLinecap="round" />
        );
      })}
      {Object.keys(SKETCH_PTS).map((id) => {
        const [x, y] = SKETCH_PTS[id];
        const v = !!visited[id];
        return v ? (
          <circle key={id} cx={x} cy={y} r={4.2} fill="var(--sign)" stroke="#FFFFFF" strokeWidth={1.4} />
        ) : (
          <circle key={id} cx={x} cy={y} r={2.2} fill="#CDCCC0" />
        );
      })}
    </svg>
  );
}

const TRIPS = [
  { id: "biglap", name: "The Big Lap", lap: true,
    blurb: "The one on every caravanner\u2019s list \u2014 roughly 14,000 km right around the country. Chase the warmth: most rigs do the Top End and the Kimberley in the dry (May\u2013Sep), so pick a direction that lands you up north in winter. Whitsundays, Katherine Gorge, Cable Beach, Ningaloo, the Nullarbor \u2014 all of it, one lap." },
  { id: "gor", name: "Great Ocean Road & Limestone Coast",
    stops: ["melbourne", "apollobay", "portcampbell", "mtgambier", "robe", "adelaide"],
    blurb: "Australia\u2019s most famous drive, then the quiet brilliant bit most people skip. Wind past Bells Beach and Lorne to Apollo Bay, stand at the Twelve Apostles, then keep going \u2014 whales at Warrnambool (Jun\u2013Sep), the Blue Lake at Mount Gambier, doughnuts in Robe and the Coorong\u2019s dunes on the run home." },
  { id: "nullarbor", name: "Across the Nullarbor", stops: ["adelaide", "perth"],
    blurb: "The crossing that earns you the sticker. Whales at the Head of Bight (May\u2013Oct), the Bunda cliffs dropping into the Southern Ocean, a hole on the world\u2019s longest golf course, and the 90 Mile Straight. Roadhouse rhythm at its finest \u2014 the fill plan below is your best mate out here." },
  { id: "centre", name: "Straight up the Centre", stops: ["adelaide", "yulara", "alicesprings", "darwin"],
    blurb: "The Explorer\u2019s Way through the heart of it all. Sleep underground in Coober Pedy, take the Uluru detour that isn\u2019t optional, watch sunrise at the Devils Marbles, soak at Mataranka\u2019s thermal pools and cruise Katherine Gorge before Darwin\u2019s markets and sunsets." },
  { id: "eastcoast", name: "East Coast Classic", stops: ["sydney", "cairns"],
    blurb: "Beaches all the way up. Koalas at Port Macquarie, a Byron day trip from Ballina, whales off Hervey Bay, turtles at Bundaberg (Nov\u2013Mar), sailing the Whitsundays out of Airlie, Magnetic Island from Townsville, and the reef itself from Cairns." },
  { id: "tassie", name: "Lap of Tassie",
    stops: ["melbourne", "devonport", "strahan", "hobart", "portarthur", "sthelens", "devonport"],
    blurb: "Ship the rig across Bass Strait and do the island properly. Murals at Sheffield and Cradle Country beyond, the Gordon River from Strahan, MONA and Salamanca in Hobart, Port Arthur\u2019s heavy history, then the east coast run home \u2014 Wineglass Bay, Bicheno\u2019s penguins, the Bay of Fires." },
  { id: "outbackway", name: "The Outback Way",
    stops: ["winton", "alicesprings", "yulara", "laverton"],
    blurb: "Australia\u2019s longest shortcut \u2014 dinosaurs at Winton, the Plenty Highway\u2019s station country, the red heart and Uluru, then the Great Central Road to the Goldfields. Genuine dirt-road adventure: off-road van territory, carry extra everything, permits sorted before you go." },
  { id: "matilda", name: "Matilda Country",
    stops: ["brisbane", "roma", "longreach", "winton"],
    blurb: "Waltzing Matilda country on full bitumen. Roma\u2019s cattle sales, artesian hot soaks at Mitchell and Blackall, the Qantas Founders Museum and Stockman\u2019s Hall of Fame in Longreach, dinosaur stampedes at Winton \u2014 and outback pubs like the Walkabout Creek all the way." },  { id: "capeyork", name: "Cape York — the Tip",
    stops: ["cairns", "mareeba", "laura", "coen", "archerriver", "bramwell", "bamaga"],
    blurb: "The pilgrimage. Up the Peninsula Developmental Road through Quinkan rock-art country, an Archer River burger, the Jardine ferry, and finally the sign at Pajinka: you are standing at the northernmost point of the Australian continent. Dry season only (roughly May\u2013Nov) \u2014 corrugations guaranteed, bragging rights permanent." },
  { id: "gibb", name: "The Gibb River Road",
    stops: ["broome", "derby", "imintji", "mtbarnett", "ellenbrae", "elquestro", "kununurra"],
    blurb: "660 km of the Kimberley\u2019s greatest hits joined by corrugated dirt: Bell and Manning gorges, scones at Ellenbrae, Emma Gorge and Zebedee springs at El Questro. Dry season only (May\u2013Sep), off-road van or camper strongly advised \u2014 and fuel at Mt Barnett costs what it costs." },
  { id: "savannah", name: "The Savannah Way",
    stops: ["katherine", "dalywaters", "borroloola", "hellsgate", "burketown", "normanton", "karumba", "normanton", "croydon", "georgetown", "mtsurprise", "atherton", "cairns"],
    blurb: "Coast to coast across the top \u2014 the Gulf way. Barra water at Borroloola, the border beer at Hells Gate, sunset prawns at Karumba (the only Gulf town on the sea), lava tubes at Undara, then over the Tablelands and down the range into Cairns. Dry season for the unsealed middle." },

];

const STATE_GROUPS = [
  ["SA", "South Australia"], ["NT", "Northern Territory"], ["WA", "Western Australia"],
  ["VIC", "Victoria"], ["NSW", "New South Wales"], ["ACT", "Canberra & the ACT"],
  ["QLD", "Queensland"], ["TAS", "Tasmania"],
];

const fmt = (n, d = 0) =>
  n.toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });

const mapUrl = (id) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(NODES[id].n + " " + NODES[id].st + " Australia")}`;

/* Approximate coordinates for live weather (Open-Meteo) */
const COORDS = {
  adelaide:[-34.93,138.6], ptwakefield:[-34.18,138.15], ptpirie:[-33.19,138.02],
  ptaugusta:[-32.49,137.77], quorn:[-32.35,138.04], hawker:[-31.89,138.42],
  wilpena:[-31.53,138.6], pimba:[-31.25,136.81], glendambo:[-30.97,135.75],
  cooberpedy:[-29.01,134.75], cadney:[-27.91,134.05], marla:[-27.3,133.62],
  kulgera:[-25.84,133.3], erldunda:[-25.2,133.2], curtin:[-25.31,131.76],
  yulara:[-25.24,130.99], alicesprings:[-23.7,133.88], titree:[-22.13,133.42],
  barrowck:[-21.55,133.89], tennant:[-19.65,134.19], renner:[-18.32,133.8],
  elliott:[-17.55,133.54], dunmarra:[-16.68,133.42], dalywaters:[-16.25,133.37],
  mataranka:[-14.92,133.07], katherine:[-14.47,132.26], adelriver:[-13.24,131.11],
  darwin:[-12.46,130.84], ironknob:[-32.73,137.15], kimba:[-33.14,136.42],
  wudinna:[-33.05,135.46], ceduna:[-32.13,133.67], penong:[-31.93,133.01],
  nundroo:[-31.78,132.22], nullarborrh:[-31.45,130.9], bordervillage:[-31.64,129.01],
  eucla:[-31.68,128.89], mundrabilla:[-31.86,128.32], madura:[-31.9,127.02],
  cocklebiddy:[-32.04,126.1], caiguna:[-32.27,125.48], balladonia:[-32.35,123.62],
  norseman:[-32.2,121.78], coolgardie:[-30.95,121.17], southerncross:[-31.23,119.33],
  merredin:[-31.48,118.28], northam:[-31.65,116.67], perth:[-31.95,115.86],
  murraybridge:[-35.12,139.27], tailembend:[-35.25,139.45], keith:[-36.1,140.35],
  bordertown:[-36.31,140.77], nhill:[-36.33,141.65], horsham:[-36.71,142.2],
  ararat:[-37.28,142.93], ballarat:[-37.56,143.85], melbourne:[-37.81,144.96],
  waikerie:[-34.18,139.98], renmark:[-34.17,140.74], mildura:[-34.19,142.16],
  euston:[-34.57,142.75], balranald:[-34.64,143.56], hay:[-34.51,144.84],
  narrandera:[-34.75,146.55], wagga:[-35.11,147.37], gundagai:[-35.07,148.1],
  yass:[-34.84,148.91], goulburn:[-34.75,149.72], sydney:[-33.87,151.21],
  seymour:[-37.03,145.14], benalla:[-36.55,145.98], wangaratta:[-36.36,146.32],
  albury:[-36.08,146.92], holbrook:[-35.72,147.31], burra:[-33.68,138.93],
  peterborough:[-32.97,138.84], yunta:[-32.58,139.55], brokenhill:[-31.96,141.47],
  wentworth:[-34.11,141.92], victorharbor:[-35.55,138.62], wauchope:[-20.64,134.22],
  newcastle:[-32.93,151.78], portmacquarie:[-31.43,152.91], coffsharbour:[-30.3,153.11],
  grafton:[-29.69,152.93], ballina:[-28.87,153.56], goldcoast:[-28.0,153.43],
  brisbane:[-27.47,153.03], sunshinecoast:[-26.65,153.09], gympie:[-26.19,152.67],
  maryborough:[-25.54,152.7], bundaberg:[-24.87,152.35], gladstone:[-23.84,151.26],
  rockhampton:[-23.38,150.51], mackay:[-21.14,149.19], proserpine:[-20.4,148.58],
  bowen:[-20.01,148.25], townsville:[-19.26,146.82], cardwell:[-18.27,146.03],
  innisfail:[-17.52,146.03], cairns:[-16.92,145.77], barklyhs:[-19.71,135.82],
  camooweal:[-19.92,138.12], mtisa:[-20.73,139.49], cloncurry:[-20.71,140.51],
  juliacreek:[-20.66,141.75], richmondq:[-20.73,143.14], hughenden:[-20.85,144.2],
  charterstowers:[-20.08,146.26], canberra:[-35.28,149.13], geelong:[-38.15,144.36],
  devonport:[-41.18,146.35], burnie:[-41.05,145.91], stanley:[-40.76,145.3],
  sheffield:[-41.38,146.33], launceston:[-41.44,147.14], rosebery:[-41.78,145.54],
  queenstown:[-42.08,145.55], strahan:[-42.15,145.33], derwentbridge:[-42.13,146.24],
  oatlands:[-42.3,147.37], sthelens:[-41.32,148.24], bicheno:[-41.87,148.3],
  swansea:[-42.12,148.07], triabunna:[-42.51,147.91], sorell:[-42.79,147.56],
  portarthur:[-43.15,147.85], hobart:[-42.88,147.33], hamiltontas:[-42.55,146.84],
  victoriariver:[-15.61,131.12], timbercreek:[-15.66,130.48], kununurra:[-15.77,128.74],
  warmun:[-17.02,128.22], hallscreek:[-18.23,127.66], fitzroycrossing:[-18.2,125.58],
  willare:[-17.73,123.65], derby:[-17.3,123.63], broome:[-17.96,122.24],
  sandfire:[-19.77,121.09], pardoo:[-20.11,119.58], porthedland:[-20.31,118.61],
  roebourne:[-20.77,117.15], karratha:[-20.74,116.85], nanutarra:[-22.54,115.49],
  minilya:[-23.81,114.42], coralbay:[-23.14,113.77], exmouth:[-21.93,114.13],
  carnarvon:[-24.88,113.66], overlander:[-26.4,114.47], northampton:[-28.35,114.63],
  kalbarri:[-27.71,114.16], geraldton:[-28.77,114.61], dongara:[-29.25,114.93],
  jurienbay:[-30.31,115.04], kalgoorlie:[-30.75,121.47], leonora:[-28.88,121.33],
  laverton:[-28.63,122.4], dockerriver:[-24.87,129.09], warakurna:[-25.05,128.3],
  warburton:[-26.13,126.58], tjukayirla:[-27.35,124.35], gemtree:[-22.98,134.25],
  jervois:[-22.91,136.13], tobermorey:[-22.26,137.96], boulia:[-22.91,139.91],
  middleton:[-22.35,141.55], mckinlay:[-21.27,141.29], kynuna:[-21.58,141.92],
  winton:[-22.39,143.04], longreach:[-23.44,144.25], barcaldine:[-23.55,145.29],
  blackall:[-24.42,145.46], tambo:[-24.88,146.26], charleville:[-26.4,146.24],
  mitchell:[-26.49,147.98], roma:[-26.57,148.79], miles:[-26.66,150.19],
  dalby:[-27.18,151.26], toowoomba:[-27.56,151.95], emerald:[-23.53,148.16],
  torquay:[-38.33,144.32], apollobay:[-38.76,143.67], portcampbell:[-38.62,142.99],
  warrnambool:[-38.38,142.48], portfairy:[-38.39,142.24], portland:[-38.34,141.6],
  mtgambier:[-37.83,140.78], robe:[-37.16,139.76], meningie:[-35.69,139.34],
  bunbury:[-33.33,115.64], busselton:[-33.65,115.35], margaretriver:[-33.95,115.07],
  pemberton:[-34.44,116.03], walpole:[-34.98,116.73], denmark:[-34.96,117.35],
  albany:[-35.02,117.88], esperance:[-33.86,121.89],
  batchelor:[-13.05,131.03], jabiru:[-12.67,132.84], cooinda:[-12.9,132.52], pinecreek:[-13.82,131.83],
  imintji:[-17.43,125.28], mtbarnett:[-16.66,125.91], ellenbrae:[-15.95,127.07], elquestro:[-16.01,128.0],
  borroloola:[-16.07,136.3], hellsgate:[-17.45,138.36], burketown:[-17.74,139.55],
  normanton:[-17.67,141.08], karumba:[-17.48,140.83], croydon:[-18.2,142.24],
  georgetown:[-18.29,143.55], mtsurprise:[-18.15,144.32], atherton:[-17.27,145.48],
  mareeba:[-17.0,145.42], laura:[-15.56,144.45], coen:[-13.94,143.2],
  archerriver:[-13.43,142.94], bramwell:[-12.15,142.61], bamaga:[-10.89,142.39],
  dubbo:[-32.24,148.6], nyngan:[-31.56,147.19], bourke:[-30.09,145.94],
  lightningridge:[-29.43,147.98], moree:[-29.46,149.84], goondiwindi:[-28.55,150.31],
  tamworth:[-31.09,150.93], armidale:[-30.51,151.66], tenterfield:[-29.05,152.02], warwick:[-28.22,152.03],
  nowra:[-34.88,150.6], batemansbay:[-35.71,150.18], merimbula:[-36.89,149.9],
  lakesentrance:[-37.88,147.98], sale:[-38.11,147.07],

};

/* WMO weather codes → label + emoji */
function wxInfo(code) {
  if (code === 0) return { t: "Clear", e: "☀️" };
  if (code <= 2) return { t: "Partly cloudy", e: "⛅" };
  if (code === 3) return { t: "Overcast", e: "☁️" };
  if (code === 45 || code === 48) return { t: "Fog", e: "🌫️" };
  if (code >= 51 && code <= 67) return { t: "Rain", e: "🌧️" };
  if (code >= 71 && code <= 77) return { t: "Snow", e: "❄️" };
  if (code >= 80 && code <= 82) return { t: "Showers", e: "🌦️" };
  if (code >= 95) return { t: "Storms", e: "⛈️" };
  return { t: "Mixed", e: "🌡️" };
}

/* ============ Route map (Leaflet + OpenStreetMap) ============ */

const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

let leafletPromise = null;
function loadLeaflet() {
  if (typeof window === "undefined" || typeof document === "undefined")
    return Promise.reject(new Error("no browser"));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const fail = (e) => { leafletPromise = null; reject(e || new Error("map blocked")); };
    const timer = setTimeout(() => fail(new Error("map timed out")), 8000);
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = LEAFLET_JS;
    js.async = true;
    js.onload = () => { clearTimeout(timer); window.L ? resolve(window.L) : fail(); };
    js.onerror = () => { clearTimeout(timer); fail(); };
    document.head.appendChild(js);
  });
  return leafletPromise;
}

/* Flat projection of every stop for the offline sketch */
const SK_W = 640, SK_H = 470, SK_PAD = 28;
const SKETCH_PTS = (() => {
  const ids = Object.keys(COORDS);
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  ids.forEach((id) => {
    const [la, ln] = COORDS[id];
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (ln < minLng) minLng = ln;
    if (ln > maxLng) maxLng = ln;
  });
  const sx = (SK_W - SK_PAD * 2) / (maxLng - minLng);
  const sy = (SK_H - SK_PAD * 2) / (maxLat - minLat);
  const pts = {};
  ids.forEach((id) => {
    const [la, ln] = COORDS[id];
    pts[id] = [SK_PAD + (ln - minLng) * sx, SK_PAD + (maxLat - la) * sy];
  });
  return pts;
})();

function RouteSketch({ route, waypoints, fills, marks }) {
  const onRoute = new Set(route.stops);
  const pts = SKETCH_PTS;
  const runs = [];
  if (route.segs.length > 0) {
    const sIdx = marks ? route.stops.indexOf(marks.start) : -1;
    const eIdx = marks ? route.stops.lastIndexOf(marks.end) : -1;
    const hasMarks = sIdx >= 0 && eIdx >= 0;
    const posOf = (i) => hasMarks && (i < sIdx || i >= eIdx);
    const keyOf = (s, i) => (s.t === "y" ? "ferry" : s.t === "u" ? "dirt" : "road") + (posOf(i) ? "-pos" : "");
    let cur = [route.stops[0]], curKind = keyOf(route.segs[0], 0);
    route.segs.forEach((s, i) => {
      const kind = keyOf(s, i);
      const nxt = route.stops[i + 1];
      if (kind !== curKind) {
        runs.push({ ids: cur, kind: curKind });
        cur = [route.stops[i]];
        curKind = kind;
      }
      cur.push(nxt);
    });
    if (cur.length > 1) runs.push({ ids: cur, kind: curKind });
  }
  const ptStr = (ids) => ids.map((id) => pts[id][0].toFixed(1) + "," + pts[id][1].toFixed(1)).join(" ");
  return (
    <svg viewBox={"0 0 " + SK_W + " " + SK_H} role="img"
         aria-label="Sketch of the JourneyPro road network with your route highlighted"
         style={{ width: "100%", height: "auto", display: "block", background: "var(--paper)",
                  border: "1.5px solid var(--line)", borderRadius: 12 }}>
      {EDGES.map(([a, b], i) => (
        <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]}
              stroke="#CFCEC2" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
      ))}
      {runs.map((r, i) => r.kind === "road-pos" || r.kind === "ferry-pos" || r.kind === "dirt-pos" ? (
        r.kind === "road-pos" ? (
          <polyline key={"run" + i} points={ptStr(r.ids)} fill="none" stroke="var(--sign)"
                    strokeOpacity={0.45} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : r.kind === "ferry-pos" ? (
          <polyline key={"run" + i} points={ptStr(r.ids)} fill="none" stroke="var(--sign)"
                    strokeOpacity={0.6} strokeWidth={2} strokeDasharray="6 7" strokeLinecap="round" />
        ) : (
          <polyline key={"run" + i} points={ptStr(r.ids)} fill="none" stroke="var(--amber)"
                    strokeOpacity={0.7} strokeWidth={2.5} strokeDasharray="8 6" strokeLinecap="round" />
        )
      ) : r.kind === "ferry" ? (
        <polyline key={"run" + i} points={ptStr(r.ids)} fill="none" stroke="var(--sign)"
                  strokeWidth={2.5} strokeDasharray="6 7" strokeLinejoin="round" strokeLinecap="round" />
      ) : r.kind === "dirt" ? (
        <g key={"run" + i}>
          <polyline points={ptStr(r.ids)} fill="none" stroke="var(--ink)" strokeWidth={5.5}
                    strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={ptStr(r.ids)} fill="none" stroke="var(--amber)" strokeWidth={3}
                    strokeDasharray="8 6" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ) : (
        <g key={"run" + i}>
          <polyline points={ptStr(r.ids)} fill="none" stroke="#FFFFFF" strokeWidth={6.5}
                    strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={ptStr(r.ids)} fill="none" stroke="var(--sign)" strokeWidth={3.5}
                    strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
      {Object.keys(SKETCH_PTS).map((id) => {
        const [x, y] = pts[id];
        if (waypoints.includes(id)) {
          const isStart = marks && onRoute.has(id) && marks.start === id;
          return (
            <rect key={id} x={x - 5.5} y={y - 5.5} width={11} height={11}
                  fill={isStart ? "var(--red)" : "var(--amber)"}
                  stroke={isStart ? "#fff" : "var(--ink)"} strokeWidth={2}
                  transform={"rotate(45 " + x + " " + y + ")"} />
          );
        }
        if (fills[id]) {
          return <circle key={id} cx={x} cy={y} r={4.5} fill="var(--amber)" stroke="var(--ink)" strokeWidth={1.5} />;
        }
        if (onRoute.has(id)) {
          return <circle key={id} cx={x} cy={y} r={3.5} fill="var(--sign)" stroke="#FFFFFF" strokeWidth={1.5} />;
        }
        return <circle key={id} cx={x} cy={y} r={2} fill="#C4C3B6" />;
      })}
    </svg>
  );
}

function RouteMap({ route, waypoints, fills, dayAt, stays, marks, visited, onToggleVisited }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const onToggleRef = useRef(onToggleVisited);
  onToggleRef.current = onToggleVisited;
  const [mapState, setMapState] = useState("loading"); /* loading | live | sketch */

  useEffect(() => {
    let dead = false;
    loadLeaflet()
      .then((L) => {
        if (dead || !boxRef.current || mapRef.current) return;
        const m = L.map(boxRef.current, { zoomControl: true, scrollWheelZoom: false });
        if (m.attributionControl) m.attributionControl.setPrefix(false);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 17,
          className: "jp-tiles",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(m);
        m.on("click", () => m.scrollWheelZoom.enable());
        overlayRef.current = L.layerGroup().addTo(m);
        m.getContainer().addEventListener("click", (ev) => {
          const b = ev.target && ev.target.closest ? ev.target.closest(".jp-popvisit") : null;
          if (b && onToggleRef.current) {
            onToggleRef.current(b.getAttribute("data-jpid"));
            m.closePopup();
          }
        });
        mapRef.current = m;
        setMapState("live");
      })
      .catch(() => { if (!dead) setMapState("sketch"); });
    return () => {
      dead = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        overlayRef.current = null;
      }
    };
  }, []);

  const fitTrip = () => {
    const L = typeof window !== "undefined" ? window.L : null;
    const m = mapRef.current;
    if (!L || !m) return;
    m.invalidateSize();
    const ids = route.stops.length > 1 ? route.stops : Object.keys(COORDS);
    m.fitBounds(L.latLngBounds(ids.map((id) => COORDS[id])), { padding: [30, 30] });
  };

  useEffect(() => {
    const L = typeof window !== "undefined" ? window.L : null;
    const m = mapRef.current;
    const ov = overlayRef.current;
    if (mapState !== "live" || !L || !m || !ov) return;
    ov.clearLayers();

    const onRoute = new Set(route.stops);

    /* The whole JourneyPro network, faint */
    EDGES.forEach(([a, b]) => {
      L.polyline([COORDS[a], COORDS[b]], {
        color: "#9AA097", weight: 1.6, opacity: 0.5, dashArray: "3 5", interactive: false,
      }).addTo(ov);
    });

    /* The active route: cased green on bitumen, dashed green over Bass Strait,
       ink-cased dashed amber on unsealed Outback Way legs */
    if (route.segs.length > 0) {
      const sIdx = marks ? route.stops.indexOf(marks.start) : -1;
      const eIdx = marks ? route.stops.lastIndexOf(marks.end) : -1;
      const hasMarks = sIdx >= 0 && eIdx >= 0;
      const posOf = (i) => hasMarks && (i < sIdx || i >= eIdx);
      const keyOf = (s, i) => (s.t === "y" ? "ferry" : s.t === "u" ? "dirt" : "road") + (posOf(i) ? "-pos" : "");
      const runs = [];
      let cur = [route.stops[0]], curKind = keyOf(route.segs[0], 0);
      route.segs.forEach((s, i) => {
        const kind = keyOf(s, i);
        const nxt = route.stops[i + 1];
        if (kind !== curKind) {
          runs.push({ ids: cur, kind: curKind });
          cur = [route.stops[i]];
          curKind = kind;
        }
        cur.push(nxt);
      });
      if (cur.length > 1) runs.push({ ids: cur, kind: curKind });
      runs.forEach((r) => {
        const path = r.ids.map((id) => COORDS[id]);
        const pos = r.kind.endsWith("-pos");
        const surf = r.kind.replace("-pos", "");
        if (surf === "ferry") {
          L.polyline(path, { color: "#00674F", weight: 3, opacity: 0.9, dashArray: "7 9", interactive: false }).addTo(ov);
        } else if (surf === "dirt") {
          L.polyline(path, { color: "#21262A", weight: 7, opacity: 0.9, lineJoin: "round", interactive: false }).addTo(ov);
          L.polyline(path, { color: "#F5B301", weight: 4, opacity: 1, dashArray: "10 8", interactive: false }).addTo(ov);
        } else if (pos) {
          /* positioning legs: getting to the route, and home again */
          L.polyline(path, { color: "#00674F", weight: 3.5, opacity: 0.45, lineJoin: "round", interactive: false }).addTo(ov);
        } else {
          L.polyline(path, { color: "#FFFFFF", weight: 8, opacity: 0.9, lineJoin: "round", interactive: false }).addTo(ov);
          L.polyline(path, { color: "#00674F", weight: 4, opacity: 1, lineJoin: "round", interactive: false }).addTo(ov);
        }
      });
    }

    const dayOf = {};
    route.stops.forEach((id, i) => { if (dayOf[id] === undefined) dayOf[id] = dayAt[i]; });

    Object.keys(COORDS).forEach((id) => {
      const node = NODES[id];
      if (!node) return;
      const anchor = waypoints.includes(id);
      const on = onRoute.has(id);
      let marker;
      if (anchor) {
        const num = waypoints.indexOf(id) + 1;
        const isStart = marks && on && marks.start === id;
        const isEnd = marks && on && marks.end === id && marks.end !== marks.start;
        const cls = "jp-mapdiamond" + (isStart ? " jp-mapdiamond-red" : isEnd ? " jp-mapdiamond-end" : "");
        marker = L.marker(COORDS[id], {
          icon: L.divIcon({
            className: "",
            html: '<span class="' + cls + '"><i>' + (isStart ? "S" : isEnd ? "F" : num) + "</i></span>",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
          keyboard: false,
        });
      } else if (on && fills[id]) {
        marker = L.circleMarker(COORDS[id], { radius: 6.5, color: "#21262A", weight: 2, fillColor: "#F5B301", fillOpacity: 1 });
      } else if (on) {
        marker = L.circleMarker(COORDS[id], { radius: 5, color: "#FFFFFF", weight: 2, fillColor: "#00674F", fillOpacity: 1 });
      } else if (visited && visited[id]) {
        marker = L.circleMarker(COORDS[id], { radius: 4.5, color: "#FFFFFF", weight: 1.5, fillColor: "#00674F", fillOpacity: 0.85 });
      } else {
        marker = L.circleMarker(COORDS[id], { radius: 3.5, color: "#8E948B", weight: 1, fillColor: "#C4C3B6", fillOpacity: 0.9 });
      }

      const bits = [];
      if (on && dayOf[id] !== undefined) bits.push('<span class="jp-popchip">Day ' + dayOf[id] + "</span>");
      if (fills[id]) bits.push('<span class="jp-popchip jp-popfill">⛽ Fill ~' + Math.round(fills[id].litres) + " L</span>");
      const layN = Math.max(0, Number(stays[id]) || 0);
      if (on && layN > 0) bits.push('<span class="jp-popchip">🌙 ' + layN + (layN === 1 ? " night" : " nights") + "</span>");
      if (!node.f) bits.push('<span class="jp-popchip jp-popred">No fuel</span>');
      if (visited && visited[id]) bits.push('<span class="jp-popchip jp-popvis">✓ Been here ' + String(visited[id]).slice(0, 4) + "</span>");

      marker.bindPopup(
        '<div class="jp-pop"><p class="jp-popname">' + node.n + " <span>· " + node.st + "</span></p>" +
        (bits.length ? '<p class="jp-poprow">' + bits.join(" ") + "</p>" : "") +
        '<p class="jp-popkind">' + (node.k === "rh" ? "Roadhouse" : node.k === "city" ? "City" : "Town") + " · " + node.g + "</p>" +
        '<button type="button" class="jp-popvisit" data-jpid="' + id + '">' +
        (visited && visited[id] ? "Unmark visited" : "✓ Mark as visited") + "</button></div>",
        { closeButton: false, offset: [0, -4] }
      );
      marker.addTo(ov);
    });

    fitTrip();
  }, [mapState, route, waypoints, fills, dayAt, stays, marks, visited]);

  return (
    <div className="jp-card p-5 jp-sec-trip">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="jp-eyebrow inline-flex items-center gap-2">
          <MapIcon size={16} style={{ color: "var(--sign)" }} aria-hidden /> Route map
        </span>
        {mapState === "live" && (
          <button type="button" className="jp-preset" onClick={fitTrip}>Recenter</button>
        )}
      </div>

      {mapState === "sketch" ? (
        <>
          <RouteSketch route={route} waypoints={waypoints} fills={fills} marks={marks} />
          <p className="jp-note mt-2">
            Network sketch — the full interactive map (real roads, towns and zoom) loads on the
            live website with an internet connection.
          </p>
        </>
      ) : (
        <div className="jp-mapwrap">
          <div ref={boxRef} className="jp-map" aria-label="Interactive route map" />
          {mapState === "loading" && (
            <div className="jp-maploading">
              <Loader2 size={18} className="animate-spin" aria-hidden /> Loading map…
            </div>
          )}
        </div>
      )}

      {route.stops.length > 1 ? (
        <p className="jp-note mt-2">
          <span className="jp-key jp-key-d" aria-hidden /> destinations · <span className="jp-key jp-key-r" aria-hidden /> route
          stops · <span className="jp-key jp-key-f" aria-hidden /> fill-ups
          {route.segs.some((s) => s.t === "u") && (
            <> · <span className="jp-key jp-key-u" aria-hidden /> unsealed</>
          )}
          {marks && route.stops.indexOf(marks.start) > 0 && (
            <> · <span className="jp-key jp-key-p" aria-hidden /> getting there</>
          )}
          {mapState === "live" ? " — tap any pin for details" : ""}
        </p>
      ) : (
        <p className="jp-note mt-2">Add destinations and your route draws itself across the network.</p>
      )}
    </div>
  );
}


/* ============ Trip ideas: curated runs + weekender planner ============ */

const LAP_RING = ["adelaide", "melbourne", "sydney", "brisbane", "cairns", "darwin", "broome", "perth"];

function bigLapFrom(startId, dir) {
  const i = Math.max(0, LAP_RING.indexOf(startId));
  const rot = [...LAP_RING.slice(i), ...LAP_RING.slice(0, i)];
  const seq = dir === "cw" ? [rot[0], ...rot.slice(1).reverse()] : rot;
  return [...seq, startId];
}

function measureTrip(stops) {
  let km = 0, dirt = 0, ferry = false;
  for (let i = 0; i < stops.length - 1; i++) {
    const part = findPath(stops[i], stops[i + 1]);
    if (!part) return { km: 0, dirt: 0, ferry: false, ok: false };
    for (let j = 1; j < part.length; j++) {
      const e = ADJ[part[j - 1]].find((x) => x.to === part[j]);
      if (e.t === "y") { ferry = true; continue; }
      km += e.km;
      if (e.t === "u") dirt += e.km;
    }
  }
  return { km, dirt, ferry, ok: true };
}

/* Short-break suggestions: sealed roads only, no ferries. Three picks
   spread near / middle / far so there is always a lazy option and a
   road-trip option. Lay nights fill whatever driving does not use. */
function weekendPicks(startId, days) {
  const dist = {}, done = {};
  Object.keys(NODES).forEach((id) => (dist[id] = Infinity));
  dist[startId] = 0;
  for (;;) {
    let u = null;
    Object.keys(dist).forEach((id) => {
      if (!done[id] && dist[id] < (u === null ? Infinity : dist[u])) u = id;
    });
    if (u === null || dist[u] === Infinity) break;
    done[u] = true;
    (ADJ[u] || []).forEach((e) => {
      if (e.t === "y" || e.t === "u") return;
      if (dist[u] + e.km < dist[e.to]) dist[e.to] = dist[u] + e.km;
    });
  }
  const minOne = 70, maxOne = days * 170;
  const leaf = (id) => (ADJ[id] || []).filter((e) => e.t !== "y").length === 1;
  const score = (id) =>
    (NODES[id].wk ? 4 : 0) + (leaf(id) ? 3 : 0) + (NODES[id].k === "town" ? 1 : 0);
  const tierOf = (d) => Math.min(2, Math.floor(((d - minOne) / (maxOne - minOne)) * 3));
  const best = [null, null, null];
  Object.keys(NODES).forEach((id) => {
    if (id === startId || NODES[id].k === "rh") return;
    const d = dist[id];
    if (!(d >= minOne && d <= maxOne)) return;
    const t = tierOf(d);
    const b = best[t];
    if (b === null || score(id) > score(b) || (score(id) === score(b) && d > dist[b])) best[t] = id;
  });
  return best.filter(Boolean).map((id) => {
    const drive = Math.max(1, Math.ceil((2 * dist[id]) / 420));
    return { id, km: Math.round(dist[id] * 2), lay: Math.max(0, days - drive) };
  });
}

const WK_LENGTHS = [
  { days: 4, label: "Long weekender" },
  { days: 7, label: "Week away" },
  { days: 14, label: "Fortnight" },
];

function TripIdeas({ onLoad }) {
  const [openId, setOpenId] = useState(null);
  const [lapStart, setLapStart] = useState("adelaide");
  const [lapDir, setLapDir] = useState("acw");
  const [home, setHome] = useState("adelaide");
  const [returnHome, setReturnHome] = useState(true);
  const [wkDays, setWkDays] = useState(4);

  const lapStops = useMemo(() => bigLapFrom(lapStart, lapDir), [lapStart, lapDir]);
  const picks = useMemo(() => weekendPicks(home, wkDays), [home, wkDays]);

  const planFor = (official) => {
    let wp = official.slice();
    if (home !== wp[0]) wp = [home, ...wp];
    if (returnHome && wp[wp.length - 1] !== home) wp = [...wp, home];
    return wp;
  };

  const homeControls = (suffix) => (
    <div className="jp-pickgrid mb-2">
      <div>
        <label className="block text-sm font-semibold mb-1" htmlFor={"home-" + suffix}>Departing from</label>
        <select id={"home-" + suffix} className="jp-field" value={home}
                onChange={(e) => setHome(e.target.value)}>
          {STATE_GROUPS.map(([st, label]) => (
            <optgroup key={st} label={label}>
              {Object.entries(NODES).filter(([, n]) => n.st === st)
                .sort((a, b) =>
                  (a[1].k === "city" ? 0 : 1) - (b[1].k === "city" ? 0 : 1) ||
                  a[1].n.localeCompare(b[1].n))
                .map(([id, n]) => (
                  <option key={id} value={id}>{n.n}</option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">Round trip</label>
        <button type="button" className="jp-preset" data-on={returnHome} aria-pressed={returnHome}
                onClick={() => setReturnHome(!returnHome)}>
          {returnHome ? "Returning home at the end" : "One-way — ends where the route ends"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="jp-card p-5 jp-sec-plan">
      <div className="flex items-center gap-2 mb-1">
        <Compass size={18} style={{ color: "var(--sign)" }} aria-hidden />
        <span className="jp-eyebrow">Trip ideas</span>
      </div>
      <p className="jp-note mb-2">
        Pick your departing town — every idea below quotes the true, from-your-door cost,
        positioning legs included.
      </p>

      {homeControls("top")}

      {TRIPS.map((t) => {
        const open = openId === t.id;
        const official = t.lap ? lapStops : t.stops;
        const wp = open ? planFor(official) : null;
        const m = open ? measureTrip(wp) : null;
        const off = open ? measureTrip(official) : null;
        const posKm = m && off ? Math.max(0, m.km - off.km) : 0;
        const marks = { start: official[0], end: official[official.length - 1] };
        return (
          <div key={t.id}>
            <button type="button" className="jp-triprow" aria-expanded={open}
                    onClick={() => setOpenId(open ? null : t.id)}>
              <span className="font-semibold">{t.name}</span>
              <ChevronDown size={16} aria-hidden
                           style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
            </button>
            {open && (
              <div className="jp-guide" style={{ margin: "0 0 0.6rem 0" }}>
                <p>{t.blurb}</p>
                {homeControls(t.id)}
                {t.lap && (
                  <div className="jp-pickgrid">
                    <div>
                      <label className="block text-sm font-semibold mb-1" htmlFor="lapstart">Join the ring at</label>
                      <select id="lapstart" className="jp-field" value={lapStart}
                              onChange={(e) => setLapStart(e.target.value)}>
                        {LAP_RING.map((id) => <option key={id} value={id}>{NODES[id].n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Direction</label>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Big Lap direction">
                        {[["acw", "Anticlockwise"], ["cw", "Clockwise"]].map(([d, lbl]) => (
                          <button key={d} type="button" className="jp-preset" data-on={lapDir === d}
                                  onClick={() => setLapDir(d)}>{lbl}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {m && m.ok && off && off.ok && (
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="jp-chip jp-mono">from {NODES[home].n}: ≈ {fmt(m.km)} km all-in</span>
                    {posKm > 0 && (
                      <span className="jp-chip jp-mono">
                        getting there{returnHome ? " & back" : ""}: {fmt(posKm)} km
                      </span>
                    )}
                    {posKm > 0 && (
                      <span className="jp-chip jp-mono">the route itself: {fmt(off.km)} km</span>
                    )}
                    {m.dirt > 0 && (
                      <span className="jp-chip jp-mono" style={{ color: "var(--red)", borderColor: "var(--red)" }}>
                        {fmt(m.dirt)} km unsealed
                      </span>
                    )}
                    {m.ferry && <span className="jp-chip">⛴️ ferry crossing</span>}
                  </p>
                )}
                <p>
                  <button type="button" className="jp-load"
                          onClick={() => onLoad(wp, {}, marks)}>
                    Load this trip
                  </button>
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-4 pt-3" style={{ borderTop: "1.5px solid var(--line)" }}>
        <span className="jp-eyebrow">Short on time?</span>
        <p className="jp-note mt-1 mb-2">
          Pick how long you&rsquo;ve got — JourneyPro shapes a return trip from {NODES[home].n} to fit,
          lay days at the far end included.
        </p>
        <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Trip length">
          {WK_LENGTHS.map((w) => (
            <button key={w.days} type="button" className="jp-preset" data-on={wkDays === w.days}
                    onClick={() => setWkDays(w.days)}>
              {w.label} · {w.days} days
            </button>
          ))}
        </div>
        {picks.length === 0 ? (
          <p className="jp-note mt-2">No tidy short loops from out here — try a longer trip length.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {picks.map((p) => (
              <button key={p.id} type="button" className="jp-wkpick"
                      onClick={() => onLoad([home, p.id, home], p.lay > 0 ? { [p.id]: p.lay } : {})}>
                <span className="font-semibold">{NODES[p.id].n}</span>
                <span className="jp-mono text-sm">
                  {fmt(p.km)} km round{p.lay > 0 ? " · " + p.lay + (p.lay === 1 ? " lay night" : " lay nights") : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function JourneyPro() {
  const [makeIdx, setMakeIdx] = useState(1);
  const [modelIdx, setModelIdx] = useState(0);
  const [variantIdx, setVariantIdx] = useState(1);

  const [towType, setTowType] = useState("caravan");
  const [vanMakeIdx, setVanMakeIdx] = useState(0);
  const [vanModelIdx, setVanModelIdx] = useState(3);
  const [trSizeIdx, setTrSizeIdx] = useState(2);
  const [trAtm, setTrAtm] = useState(TRAILER_SIZES[2].atms[0]);
  const [loadPct, setLoadPct] = useState(85);

  const [price, setPrice] = useState(FUEL_META.diesel.defaultPrice);
  const [waypoints, setWaypoints] = useState(["adelaide", "yulara"]);
  const [openIdx, setOpenIdx] = useState(null);

  const [vehMode, setVehMode] = useState("list");
  const [customVeh, setCustomVeh] = useState({ name: "My rig", fuel: "diesel", tank: 80, real: 10, tow: 3500, ball: "", kerb: "", gvm: "" });
  const [vanMode, setVanMode] = useState("list");
  const [customVan, setCustomVan] = useState({ style: "full", len: 19, tare: 2200, atm: 2800 });
  const [wx, setWx] = useState({ status: "idle", byId: {} });

  const [nights, setNights] = useState("");
  const [stayStyle, setStayStyle] = useState("parks");
  const [nightly, setNightly] = useState("");
  const [foodPerDay, setFoodPerDay] = useState(60);
  const [tripName, setTripName] = useState("");
  const [savedTrips, setSavedTrips] = useState([]);
  const [storageOk, setStorageOk] = useState(true);
  const [stays, setStays] = useState({});
  const [tripMarks, setTripMarks] = useState(null);
  const [travel, setTravel] = useState(null); /* { active, startedISO, pos, wp, stays, marks } */
  const [travelView, setTravelView] = useState(null); /* stop index being browsed; null = follow the trip */
  const [tab, setTab] = useState("plan"); /* mobile page: rig | plan | trip | travel | mymap */
  const [offline, setOffline] = useState(false);
  const [visited, setVisited] = useState({}); /* id -> ISO date first visited */
  const [journal, setJournal] = useState({}); /* id -> { rating, note, photos[], updated } */
  const [journalLoaded, setJournalLoaded] = useState(false);
  const [journalWarn, setJournalWarn] = useState(false);
  const [photoView, setPhotoView] = useState(null);
  const [draftNote, setDraftNote] = useState("");
  const [community, setCommunity] = useState({}); /* id -> { loading, reviews, reports, at } */
  const [communityDown, setCommunityDown] = useState(false);
  const [handle, setHandle] = useState("");
  const [repKind, setRepKind] = useState(null);
  const [repText, setRepText] = useState("");
  const [repBusy, setRepBusy] = useState(false);
  const [livePrices, setLivePrices] = useState({}); /* id -> { loading, min, avg, n, src, at } */
  const [fillLog, setFillLog] = useState([]); /* { id, d, L, $, k, trip } */
  const [fillLoaded, setFillLoaded] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logL, setLogL] = useState("");
  const [logD, setLogD] = useState("");

  const make = VEHICLE_DATA[makeIdx];
  const model = make.models[Math.min(modelIdx, make.models.length - 1)];
  const picked = model.variants[Math.min(variantIdx, model.variants.length - 1)];
  const vehicle = vehMode === "custom"
    ? { v: customVeh.name, fuel: customVeh.fuel,
        tank: Math.max(10, Number(customVeh.tank) || 0),
        real: Math.max(3, Number(customVeh.real) || 0),
        tow: Math.max(0, Number(customVeh.tow) || 0),
        ball: Math.max(0, Number(customVeh.ball) || 0) || undefined,
        kerb: Math.max(0, Number(customVeh.kerb) || 0) || undefined,
        gvm: Math.max(0, Number(customVeh.gvm) || 0) || undefined }
    : picked;
  const fuelLabel = FUEL_META[vehicle.fuel].label;

  const changeMake = (i) => {
    const nv = VEHICLE_DATA[i].models[0].variants[0];
    if (nv.fuel !== vehicle.fuel) setPrice(FUEL_META[nv.fuel].defaultPrice);
    setMakeIdx(i); setModelIdx(0); setVariantIdx(0);
  };
  const changeModel = (i) => {
    const nv = make.models[i].variants[0];
    if (nv.fuel !== vehicle.fuel) setPrice(FUEL_META[nv.fuel].defaultPrice);
    setModelIdx(i); setVariantIdx(0);
  };
  const changeVariant = (i) => {
    const nv = model.variants[i];
    if (nv.fuel !== vehicle.fuel) setPrice(FUEL_META[nv.fuel].defaultPrice);
    setVariantIdx(i);
  };

  const load = useMemo(() => {
    if (towType === "none")
      return { weight: 0, factor: 1, desc: "No towing load", atm: 0 };
    if (towType === "caravan") {
      if (vanMode === "custom") {
        const tare = Math.max(200, Number(customVan.tare) || 0);
        const atm = Math.max(tare, Number(customVan.atm) || 0);
        const len = Math.max(8, Number(customVan.len) || 0);
        const weight = Math.round(tare + (loadPct / 100) * (atm - tare));
        return {
          weight, atm, tare,
          factor: towFactor(weight, vanProfile(customVan.style, len)),
          desc: "Your van",
          sub: len + " ft " + STYLE_LABEL[customVan.style],
        };
      }
      const vm = VAN_DATA[vanMakeIdx];
      const v = vm.models[Math.min(vanModelIdx, vm.models.length - 1)];
      const weight = Math.round(v.tare + (loadPct / 100) * (v.atm - v.tare));
      return {
        weight, atm: v.atm, tare: v.tare,
        factor: towFactor(weight, vanProfile(v.style, v.len)),
        desc: vm.make + " " + v.m,
        sub: v.len + " ft " + STYLE_LABEL[v.style],
      };
    }
    const t = TRAILER_SIZES[trSizeIdx];
    const atm = t.atms.includes(trAtm) ? trAtm : t.atms[0];
    const payload = Math.round((loadPct / 100) * (atm - t.tare));
    const weight = t.tare + payload;
    return {
      weight, atm, tare: t.tare, payload,
      factor: towFactor(weight, t.profile),
      desc: t.name, sub: "rated " + fmt(atm) + " kg ATM",
    };
  }, [towType, vanMode, customVan, vanMakeIdx, vanModelIdx, trSizeIdx, trAtm, loadPct]);

  const towing = load.factor > 1;
  const overWeight = load.weight > vehicle.tow;
  const overAtm = !overWeight && load.atm > vehicle.tow;

  const addStop = (id) => {
    if (!id) return;
    setWaypoints((w) => (w[w.length - 1] === id ? w : [...w, id]));
    setOpenIdx(null);
    setWx({ status: "idle", byId: {} });
  };
  const removeStop = (i) => {
    setWaypoints((w) => w.filter((_, idx) => idx !== i));
    setOpenIdx(null);
    setWx({ status: "idle", byId: {} });
  };

  const fetchWeather = async () => {
    const ids = [...new Set(route.stops)].filter((id) => COORDS[id]);
    if (ids.length === 0) return;
    setWx({ status: "loading", byId: {} });
    try {
      const lats = ids.map((id) => COORDS[id][0]).join(",");
      const lons = ids.map((id) => COORDS[id][1]).join(",");
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lats +
        "&longitude=" + lons +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max" +
        "&timezone=auto&forecast_days=1";
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      const byId = {};
      ids.forEach((id, i) => {
        const d = list[i] && list[i].daily;
        if (d) byId[id] = {
          code: d.weather_code[0], tmax: d.temperature_2m_max[0], tmin: d.temperature_2m_min[0],
          rain: d.precipitation_probability_max[0], wind: d.wind_speed_10m_max[0],
        };
      });
      setWx({ status: "done", byId });
    } catch (err) {
      // Preview sandboxes block outside calls — show clearly-labelled sample
      // weather so the UI can still be evaluated. Live data needs the real site.
      const byId = {};
      ids.forEach((id) => {
        const lat = COORDS[id][0];
        const tmax = Math.round(34 + (lat + 12) * 0.75);
        const seed = (id.charCodeAt(0) + id.length) % 5;
        const code = [0, 1, 2, 3, 80][seed];
        byId[id] = {
          code, tmax, tmin: tmax - 12,
          rain: code === 80 ? 45 : code === 3 ? 20 : 5,
          wind: 15 + ((id.length * 7) % 30),
        };
      });
      setWx({ status: "sample", byId });
    }
  };

  /* ---------- Saved trips (preview storage) ---------- */
  const listTrips = async () => {
    try {
      const res = await window.storage.list("trips:");
      const keys = (res && res.keys) || [];
      setSavedTrips(keys.map((k) => ({ key: k, name: k.slice(6).replace(/-/g, " ") })));
    } catch (e) {
      setSavedTrips([]);
    }
  };
  useEffect(() => {
    if (typeof window === "undefined" || !window.storage) { setStorageOk(false); return; }
    listTrips();
  }, []);

  const tripSnapshot = () => ({
    waypoints, towType, loadPct, price,
    vehMode, customVeh, makeIdx, modelIdx, variantIdx,
    vanMode, customVan, vanMakeIdx, vanModelIdx, trSizeIdx, trAtm, stays, tripMarks,
  });
  const applySnapshot = (s) => {
    if (!s || !Array.isArray(s.waypoints)) return;
    setWaypoints(s.waypoints.filter((id) => NODES[id]));
    setTowType(s.towType || "caravan");
    setLoadPct(typeof s.loadPct === "number" ? s.loadPct : 85);
    if (typeof s.price === "number") setPrice(s.price);
    setVehMode(s.vehMode || "list");
    if (s.customVeh) setCustomVeh(s.customVeh);
    setMakeIdx(Math.max(0, Math.min(VEHICLE_DATA.length - 1, s.makeIdx ?? 1)));
    setModelIdx(s.modelIdx ?? 0);
    setVariantIdx(s.variantIdx ?? 0);
    setVanMode(s.vanMode || "list");
    if (s.customVan) setCustomVan(s.customVan);
    setVanMakeIdx(Math.max(0, Math.min(VAN_DATA.length - 1, s.vanMakeIdx ?? 0)));
    setVanModelIdx(s.vanModelIdx ?? 0);
    const tsi = Math.max(0, Math.min(TRAILER_SIZES.length - 1, s.trSizeIdx ?? 2));
    setTrSizeIdx(tsi);
    setTrAtm(s.trAtm ?? TRAILER_SIZES[tsi].atms[0]);
    setStays(s.stays && typeof s.stays === "object" ? s.stays : {});
    setTripMarks(s.tripMarks || null);
    setOpenIdx(null);
    setWx({ status: "idle", byId: {} });
  };
  const [story, setStory] = useState(null); /* dataURL of the generated card */
  const [storyBusy, setStoryBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sharedIn, setSharedIn] = useState(null); /* { a, b, n } — a trip arrived via link */
  const sharedRef = useRef(false);

  const makeStory = async () => {
    if (typeof document === "undefined" || route.segs.length === 0 || storyBusy) return;
    setStoryBusy(true);
    try {
      try {
        await Promise.all([
          document.fonts.load('700 76px "Barlow Condensed"'),
          document.fonts.load('600 44px "IBM Plex Mono"'),
          document.fonts.load('400 27px "Archivo"'),
        ]);
      } catch (e) { /* system fonts will do */ }

      const W = 1080, H = 1350;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const c = cv.getContext("2d");
      const SIGN = "#00674F", AMBER = "#F5B301", INK = "#21262A",
            PAPER = "#F5F4EE", LINE = "#DDDCD2", RED = "#C03B2B";
      const BC = '"Barlow Condensed", sans-serif';
      const Mono = '"IBM Plex Mono", monospace';
      const Arc = '"Archivo", system-ui, sans-serif';
      const rr = (x, y, w, h, r) => {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
      };
      const fit = (text, max) => {
        let t = text;
        while (c.measureText(t).width > max && t.length > 4) t = t.slice(0, -2).trimEnd() + "…";
        return t;
      };

      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);

      /* ---- header sign ---- */
      rr(40, 40, 1000, 296, 26); c.fillStyle = SIGN; c.fill();
      rr(52, 52, 976, 272, 18); c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 3; c.stroke();
      c.font = "700 44px " + BC;
      c.fillStyle = "#FFFFFF"; c.fillText("JOURNEY", 84, 118);
      c.fillStyle = AMBER; c.fillText("PRO", 84 + c.measureText("JOURNEY").width, 118);
      c.font = "400 23px " + Mono; c.fillStyle = "rgba(255,255,255,0.75)";
      const url = "journey-pro-jet.vercel.app";
      c.fillText(url, 996 - c.measureText(url).width, 112);
      const title = startId === endId ? "Loop from " + NODES[startId].n
                                      : NODES[startId].n + " → " + NODES[endId].n;
      let tSize = 76;
      c.font = "700 " + tSize + "px " + BC;
      while (c.measureText(title).width > 900 && tSize > 34) { tSize -= 4; c.font = "700 " + tSize + "px " + BC; }
      c.fillStyle = "#FFFFFF"; c.fillText(title, 84, 226);
      const statesN = new Set(route.stops.map((id) => NODES[id].st)).size;
      const hasFerry = route.segs.some((s) => s.t === "y");
      const dirtKm = route.segs.reduce((a, s) => a + (s.t === "u" ? s.km : 0), 0);
      c.font = "600 27px " + BC; c.fillStyle = "rgba(255,255,255,0.88)";
      c.fillText("~" + plan.days + " driving days · " + statesN +
        (statesN === 1 ? " state" : " states & territories") +
        (hasFerry ? " · ferry crossing" : "") + (dirtKm > 0 ? " · " + fmt(dirtKm) + " km dirt" : ""), 84, 288);

      /* ---- the hero: your route, zoomed to its own shape ---- */
      const px = 60, py = 376, pw = 960, ph = 568, ip = 34;
      c.save();
      c.shadowColor = "rgba(33,38,42,0.15)"; c.shadowBlur = 22; c.shadowOffsetY = 8;
      rr(px, py, pw, ph, 20); c.fillStyle = "#FFFFFF"; c.fill();
      c.restore();
      rr(px, py, pw, ph, 20); c.strokeStyle = LINE; c.lineWidth = 2.5; c.stroke();

      const stops = route.stops, segs = route.segs;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      stops.forEach((id) => {
        const [x, y] = SKETCH_PTS[id];
        bx0 = Math.min(bx0, x); by0 = Math.min(by0, y);
        bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
      });
      const bpad = 24;
      bx0 -= bpad; by0 -= bpad; bx1 += bpad; by1 += bpad;
      const spanX = Math.max(bx1 - bx0, SK_W * 0.30), spanY = Math.max(by1 - by0, SK_H * 0.30);
      const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2;
      const ox0 = Math.max(0, Math.min(SK_W - spanX, bcx - spanX / 2));
      const oy0 = Math.max(0, Math.min(SK_H - spanY, bcy - spanY / 2));
      const iw = pw - ip * 2, ih = ph - ip * 2;
      const sc = Math.min(iw / spanX, ih / spanY);
      const offx = px + ip + (iw - spanX * sc) / 2, offy = py + ip + (ih - spanY * sc) / 2;
      const T = (id) => [offx + (SKETCH_PTS[id][0] - ox0) * sc, offy + (SKETCH_PTS[id][1] - oy0) * sc];

      c.save(); rr(px, py, pw, ph, 20); c.clip();
      c.lineCap = "round"; c.lineJoin = "round";
      c.strokeStyle = "#CFCEC2"; c.lineWidth = 2.2; c.setLineDash([6, 7]);
      EDGES.forEach(([a, b]) => {
        const A = T(a), B = T(b);
        c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
      });
      c.setLineDash([]);
      const sIdx = tripMarks ? stops.indexOf(tripMarks.start) : -1;
      const eIdx = tripMarks ? stops.lastIndexOf(tripMarks.end) : -1;
      const hasMk = sIdx >= 0 && eIdx >= 0;
      const posOf = (i) => hasMk && (i < sIdx || i >= eIdx);
      const keyOf = (s, i) => (s.t === "y" ? "ferry" : s.t === "u" ? "dirt" : "road") + (posOf(i) ? "-pos" : "");
      const runs = [];
      let cur = [stops[0]], curKind = keyOf(segs[0], 0);
      segs.forEach((s, i) => {
        const kind = keyOf(s, i), nxt = stops[i + 1];
        if (kind !== curKind) { runs.push({ ids: cur, kind: curKind }); cur = [stops[i]]; curKind = kind; }
        cur.push(nxt);
      });
      if (cur.length > 1) runs.push({ ids: cur, kind: curKind });
      const tracePath = (ids) => {
        c.beginPath();
        ids.forEach((id, i) => { const p = T(id); i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); });
      };
      runs.forEach((r) => {
        const pos = r.kind.endsWith("-pos"), surf = r.kind.replace("-pos", "");
        if (surf === "ferry") {
          c.strokeStyle = SIGN; c.lineWidth = 3.5; c.setLineDash([9, 10]);
          c.globalAlpha = pos ? 0.6 : 0.95; tracePath(r.ids); c.stroke();
        } else if (surf === "dirt") {
          c.setLineDash([]); c.strokeStyle = INK; c.lineWidth = 8; c.globalAlpha = pos ? 0.5 : 0.95;
          tracePath(r.ids); c.stroke();
          c.strokeStyle = AMBER; c.lineWidth = 4.5; c.setLineDash([14, 10]); tracePath(r.ids); c.stroke();
        } else if (pos) {
          c.setLineDash([]); c.strokeStyle = SIGN; c.globalAlpha = 0.45; c.lineWidth = 4;
          tracePath(r.ids); c.stroke();
        } else {
          c.setLineDash([]); c.globalAlpha = 1;
          c.strokeStyle = "#FFFFFF"; c.lineWidth = 9.5; tracePath(r.ids); c.stroke();
          c.strokeStyle = SIGN; c.lineWidth = 5.5; tracePath(r.ids); c.stroke();
        }
        c.globalAlpha = 1; c.setLineDash([]);
      });
      const onRoute = new Set(stops);
      Object.keys(SKETCH_PTS).forEach((id) => {
        const [x, y] = T(id);
        if (waypoints.includes(id)) {
          const isStart = tripMarks && onRoute.has(id) && tripMarks.start === id;
          c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
          c.fillStyle = isStart ? RED : AMBER;
          c.strokeStyle = isStart ? "#FFFFFF" : INK; c.lineWidth = 3;
          c.fillRect(-8.5, -8.5, 17, 17); c.strokeRect(-8.5, -8.5, 17, 17);
          c.restore();
        } else if (plan.fills[id] && onRoute.has(id)) {
          c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2);
          c.fillStyle = AMBER; c.fill(); c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
        } else if (onRoute.has(id)) {
          c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2);
          c.fillStyle = SIGN; c.fill(); c.strokeStyle = "#FFFFFF"; c.lineWidth = 2.5; c.stroke();
        } else {
          c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2);
          c.fillStyle = "#C4C3B6"; c.fill();
        }
      });
      c.restore();

      /* ---- amber hero figure ---- */
      const fuelCost = Math.round(Object.values(plan.fills).reduce((a, f) => a + (f.cost || 0), 0));
      rr(60, 984, 960, 102, 18); c.fillStyle = AMBER; c.fill();
      c.strokeStyle = INK; c.lineWidth = 3; rr(60, 984, 960, 102, 18); c.stroke();
      c.fillStyle = INK; c.font = "700 54px " + BC;
      c.fillText("$" + fmt(fuelCost) + " in " + FUEL_META[vehicle.fuel].label.toLowerCase(), 96, 1052);
      c.font = "600 23px " + BC;
      const heroSub = "at the pump, hitched";
      c.fillText(heroSub, 984 - c.measureText(heroSub).width, 1046);

      /* ---- stat band ---- */
      c.textAlign = "center";
      const statCol = (x, label, value) => {
        c.font = "700 23px " + BC; c.fillStyle = SIGN;
        try { c.letterSpacing = "2px"; } catch (e) {}
        c.fillText(label, x, 1162);
        try { c.letterSpacing = "0px"; } catch (e) {}
        c.font = "600 43px " + Mono; c.fillStyle = INK;
        c.fillText(value, x, 1212);
      };
      statCol(180, "DISTANCE", fmt(plan.km) + " km");
      statCol(420, "FUEL", Math.round(plan.litres) + " L");
      statCol(660, "FILL-UPS", String(Object.keys(plan.fills).length));
      statCol(900, "DAYS", "~" + plan.days);
      c.textAlign = "left";
      c.strokeStyle = LINE; c.lineWidth = 1.5;
      [300, 540, 780].forEach((rx) => {
        c.beginPath(); c.moveTo(rx, 1132); c.lineTo(rx, 1224); c.stroke();
      });

      /* ---- rig line + day pill ---- */
      c.save(); c.translate(98, 1258); c.rotate(Math.PI / 4);
      c.fillStyle = AMBER; c.strokeStyle = INK; c.lineWidth = 2;
      c.fillRect(-6, -6, 12, 12); c.strokeRect(-6, -6, 12, 12);
      c.restore();
      const rigRaw = (vehMode === "custom" ? vehicle.v : make.make + " " + model.model) +
        (load.weight > 0 ? "  +  " + load.desc + (load.sub ? " · " + load.sub : "") : "");
      c.font = "400 26px " + Arc; c.fillStyle = INK;
      c.fillText(fit(rigRaw, travel ? 640 : 860), 118, 1268);
      if (travel) {
        const tStops = stops.length;
        let kd = 0, kt = 0;
        segs.forEach((s, i) => { if (s.t !== "y") { kt += s.km; if (i < Math.min(travel.pos, tStops) - 1) kd += s.km; } });
        const pc = kt > 0 ? Math.round((kd / kt) * 100) : 0;
        const dayN = plan.dayAt[Math.max(0, Math.min(travel.pos, tStops) - 1)] || 1;
        c.font = "700 23px " + BC;
        const chip = "Day " + dayN + " · " + pc + "%";
        const cw = c.measureText(chip).width + 40;
        rr(988 - cw, 1238, cw, 40, 20); c.fillStyle = AMBER; c.fill();
        c.strokeStyle = INK; c.lineWidth = 2; rr(988 - cw, 1238, cw, 40, 20); c.stroke();
        c.fillStyle = INK; c.fillText(chip, 988 - cw + 20, 1266);
      }

      /* ---- tagline ---- */
      c.font = "700 31px " + BC; c.fillStyle = SIGN;
      const tag = "Plan the trip before you tow.";
      c.fillText(tag, (W - c.measureText(tag).width) / 2, 1324);

      setStory(cv.toDataURL("image/png"));
    } finally {
      setStoryBusy(false);
    }
  };

  const shareStory = async () => {
    if (!story) return;
    const fname = "journeypro-" + startId + "-" + endId + ".png";
    try {
      const blob = await (await fetch(story)).blob();
      const file = new File([blob], fname, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "My JourneyPro trip",
          text: (startId === endId ? "Loop from " + NODES[startId].n : NODES[startId].n + " → " + NODES[endId].n) +
            " — planned with JourneyPro, free at journey-pro-jet.vercel.app",
        });
        return;
      }
    } catch (e) { /* fall through to download hint */ }
    const a = document.createElement("a");
    a.href = story; a.download = fname; a.click();
  };

  const persistVisited = async (obj) => {
    if (typeof window === "undefined" || !window.storage) return;
    try { await window.storage.set("visited:v1", JSON.stringify(obj)); } catch (e) { /* best effort */ }
  };
  const markVisited = (ids) => {
    setVisited((prev) => {
      const nx = { ...prev };
      let changed = false;
      ids.forEach((id) => {
        if (id && NODES[id] && !nx[id]) { nx[id] = new Date().toISOString().slice(0, 10); changed = true; }
      });
      if (changed) persistVisited(nx);
      return changed ? nx : prev;
    });
  };
  const toggleVisited = (id) => {
    if (!NODES[id]) return;
    setVisited((prev) => {
      const nx = { ...prev };
      if (nx[id]) delete nx[id];
      else nx[id] = new Date().toISOString().slice(0, 10);
      persistVisited(nx);
      return nx;
    });
  };

  useEffect(() => {
    /* Load the scratch map */
    if (typeof window === "undefined" || !window.storage) return;
    (async () => {
      try {
        const res = await window.storage.get("visited:v1");
        if (res && res.value) {
          const v = JSON.parse(res.value);
          if (v && typeof v === "object") setVisited(v);
        }
      } catch (e) { /* nothing marked yet */ }
    })();
  }, []);

  const LIVE_FUEL_STATES = ["WA", "NSW", "TAS"];
  const loadFuel = (id) => {
    if (!id || !NODES[id] || typeof fetch === "undefined") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!LIVE_FUEL_STATES.includes(NODES[id].st)) return;
    const cur = livePrices[id];
    if (cur && (cur.loading || (cur.at && Date.now() - cur.at < 1800000))) return;
    const town = NODES[id].n.replace(/\s*\(.*\)$/, "");
    setLivePrices((p) => ({ ...p, [id]: { ...(p[id] || {}), loading: true } }));
    fetch("/api/fuel?state=" + NODES[id].st + "&town=" + encodeURIComponent(town) + "&fuel=" + vehicle.fuel)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setLivePrices((p) => ({
          ...p,
          [id]: d && d.ok
            ? { loading: false, at: Date.now(), min: d.min, avg: d.avg, n: d.n, src: d.src, fuel: d.fuel }
            : { loading: false, at: Date.now(), none: true },
        }));
      })
      .catch(() => {
        setLivePrices((p) => ({ ...p, [id]: { loading: false, at: Date.now(), none: true } }));
      });
  };

  const loadCommunity = (id) => {
    if (!id || !NODES[id] || typeof fetch === "undefined") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const cur = community[id];
    if (cur && (cur.loading || (cur.at && Date.now() - cur.at < 60000))) return;
    setCommunity((p) => ({ ...p, [id]: { ...(p[id] || {}), loading: true } }));
    fetch("/api/community?stop=" + encodeURIComponent(id))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        setCommunityDown(false);
        setCommunity((p) => ({
          ...p,
          [id]: {
            loading: false,
            at: Date.now(),
            reviews: (data && data.reviews) || [],
            reports: (data && data.reports) || [],
          },
        }));
      })
      .catch(() => {
        setCommunityDown(true);
        setCommunity((p) => ({ ...p, [id]: { loading: false, at: Date.now(), reviews: [], reports: [] } }));
      });
  };

  const ensureHandle = () => {
    if (handle) return handle;
    const h = makeHandle();
    setHandle(h);
    if (typeof window !== "undefined" && window.storage) {
      try { window.storage.set("handle:v1", h); } catch (e) { /* fine */ }
    }
    return h;
  };

  const postCommunity = async (payload) => {
    const res = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };

  const shareEntry = async (id) => {
    const e = journal[id];
    if (!e || (!e.rating && !e.note)) return;
    const h = ensureHandle();
    try {
      await postCommunity({ stop: id, type: "review", handle: h, rating: e.rating || 0, text: e.note || "" });
      updateJournal(id, { sharedAt: new Date().toISOString().slice(0, 10) });
      setCommunity((p) => {
        const c = p[id] || { reviews: [], reports: [] };
        return {
          ...p,
          [id]: {
            ...c,
            reviews: [{ h, r: e.rating, t: e.note, d: new Date().toISOString().slice(0, 10) }, ...(c.reviews || [])],
          },
        };
      });
    } catch (err) {
      setCommunityDown(true);
    }
  };

  const sendReport = async (id) => {
    if (!repKind || repBusy) return;
    setRepBusy(true);
    const h = ensureHandle();
    try {
      await postCommunity({ stop: id, type: "report", handle: h, kind: repKind, text: repText });
      setCommunity((p) => {
        const c = p[id] || { reviews: [], reports: [] };
        return {
          ...p,
          [id]: {
            ...c,
            reports: [{ h, k: repKind, t: repText.trim() || undefined, d: new Date().toISOString().slice(0, 10) }, ...(c.reports || [])],
          },
        };
      });
      setRepKind(null); setRepText("");
    } catch (err) {
      setCommunityDown(true);
    } finally {
      setRepBusy(false);
    }
  };

  useEffect(() => {
    /* Load the saved road name */
    if (typeof window === "undefined" || !window.storage) return;
    (async () => {
      try {
        const res = await window.storage.get("handle:v1");
        if (res && res.value) setHandle(String(res.value).slice(0, 24));
      } catch (e) { /* none yet */ }
    })();
  }, []);

  useEffect(() => {
    /* Fetch community when a guide opens */
    const gid = openIdx != null ? route.stops[openIdx] : null;
    if (gid) { loadCommunity(gid); loadFuel(gid); }
  }, [openIdx]);

  useEffect(() => {
    /* Fetch community for the stop Travel Mode is looking at */
    if (!travel || route.segs.length === 0) return;
    const stopsL = route.stops;
    const tp = Math.min(travel.pos, stopsL.length);
    const vI = travelView == null
      ? Math.min(tp, stopsL.length - 1)
      : Math.max(0, Math.min(stopsL.length - 1, travelView));
    loadCommunity(stopsL[vI]); loadFuel(stopsL[vI]);
  }, [travel, travelView, waypoints]); /* route derives from waypoints; naming route here would hit its TDZ */

  const persistJournal = async (obj) => {
    if (typeof window === "undefined" || !window.storage) return true;
    try { await window.storage.set("journal:v1", JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  };
  const updateJournal = (id, patch) => {
    if (!NODES[id]) return;
    const cur = journal[id] || {};
    const entry = { ...cur, ...patch, updated: new Date().toISOString().slice(0, 10) };
    if (!entry.rating) delete entry.rating;
    if (!(entry.note && entry.note.trim())) delete entry.note; else entry.note = entry.note.trim();
    if (!(entry.photos && entry.photos.length)) delete entry.photos;
    const nx = { ...journal };
    const has = entry.rating || entry.note || (entry.photos && entry.photos.length);
    if (has) { nx[id] = entry; markVisited([id]); } else delete nx[id];
    setJournal(nx);
  };
  const setRating = (id, s) => updateJournal(id, { rating: s });
  const saveNote = (id) => updateJournal(id, { note: draftNote });
  const removePhoto = (id, pi) => {
    const cur = (journal[id] && journal[id].photos) || [];
    updateJournal(id, { photos: cur.filter((_, k) => k !== pi) });
  };
  const shrinkPhoto = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAXP = 900;
      const s = Math.min(1, MAXP / Math.max(img.width, img.height));
      const cw = Math.max(1, Math.round(img.width * s)), ch = Math.max(1, Math.round(img.height * s));
      const cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
  const addPhotos = async (id, files, inputEl) => {
    try {
      const cur = (journal[id] && journal[id].photos) || [];
      const slots = Math.max(0, 3 - cur.length);
      const picked = Array.from(files || []).slice(0, slots);
      if (!picked.length) return;
      const shrunk = [];
      for (const f of picked) {
        try { shrunk.push(await shrinkPhoto(f)); } catch (e) { /* skip bad file */ }
      }
      if (shrunk.length) updateJournal(id, { photos: [...cur, ...shrunk] });
    } finally {
      if (inputEl) inputEl.value = "";
    }
  };

  useEffect(() => {
    /* Load the journal */
    if (typeof window === "undefined" || !window.storage) { setJournalLoaded(true); return; }
    (async () => {
      try {
        const res = await window.storage.get("journal:v1");
        if (res && res.value) {
          const j = JSON.parse(res.value);
          if (j && typeof j === "object") setJournal(j);
        }
      } catch (e) { /* fresh journal */ }
      setJournalLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!journalLoaded) return;
    persistJournal(journal).then((ok) => setJournalWarn(!ok));
  }, [journal, journalLoaded]);
  useEffect(() => {
    const jid = openIdx != null ? route.stops[openIdx] : null;
    setDraftNote(jid && journal[jid] && journal[jid].note ? journal[jid].note : "");
  }, [openIdx]);

  const persistFills = async (arr) => {
    if (typeof window === "undefined" || !window.storage) return;
    try { await window.storage.set("fills:v1", JSON.stringify(arr)); } catch (e) { /* best effort */ }
  };
  const addFill = (id, k) => {
    const L = Number(logL), D = Number(logD);
    if (!travel || !(L > 0) || !(D > 0) || !NODES[id]) return;
    const entry = {
      id, d: new Date().toISOString().slice(0, 10),
      L: Math.round(L * 10) / 10, $: Math.round(D),
      k: Math.round(k), trip: travel.startedISO,
    };
    setFillLog([...fillLog, entry]);
    setLogOpen(false);
  };
  const removeFill = (entry) => setFillLog(fillLog.filter((f) => f !== entry));

  useEffect(() => {
    /* Load the fill log */
    if (typeof window === "undefined" || !window.storage) { setFillLoaded(true); return; }
    (async () => {
      try {
        const res = await window.storage.get("fills:v1");
        if (res && res.value) {
          const arr = JSON.parse(res.value);
          if (Array.isArray(arr)) setFillLog(arr);
        }
      } catch (e) { /* no fills yet */ }
      setFillLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!fillLoaded) return;
    persistFills(fillLog);
  }, [fillLog, fillLoaded]);

  useEffect(() => {
    /* Watch reception come and go */
    if (typeof window === "undefined") return;
    const upd = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
    };
  }, []);

  const shareTripLink = async () => {
    if (typeof window === "undefined" || route.segs.length === 0) return;
    const code = encodeTrip(waypoints, stays, tripMarks);
    if (!code) return;
    const url = window.location.origin + window.location.pathname + "#trip=" + code;
    const title = startId === endId
      ? "Loop from " + NODES[startId].n
      : NODES[startId].n + " → " + NODES[endId].n;
    const text = title + " — " + fmt(plan.km) + " km, ~" + plan.days +
      " days. Open it and the costs calculate for YOUR rig. Planned with JourneyPro.";
    try {
      if (navigator.share) { await navigator.share({ title: "JourneyPro trip", text, url }); return; }
    } catch (e) { /* fall through to copy */ }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch (e) {
      window.prompt("Copy this trip link:", url);
    }
  };

  useEffect(() => {
    /* A shared trip arriving via the link takes the wheel */
    if (typeof window === "undefined") return;
    const mm = (window.location.hash || "").match(/#trip=([A-Za-z0-9\-_]+)/);
    if (!mm) return;
    const t = decodeTrip(mm[1]);
    if (!t) return;
    sharedRef.current = true;
    setWaypoints(t.w);
    setStays(t.s);
    setTripMarks(t.m);
    setTab("trip");
    setSharedIn({ a: t.w[0], b: t.w[t.w.length - 1], n: t.w.length });
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) { /* fine */ }
  }, []);

  const persistTravel = async (t) => {
    if (typeof window === "undefined" || !window.storage) return;
    try {
      if (t) await window.storage.set("travel:active", JSON.stringify(t));
      else await window.storage.delete("travel:active");
    } catch (e) { /* best effort */ }
  };

  useEffect(() => {
    /* Resume an in-progress trip when the app reopens */
    if (typeof window === "undefined" || !window.storage) return;
    (async () => {
      if (sharedRef.current) return; /* a shared link takes the wheel this session */
      try {
        const res = await window.storage.get("travel:active");
        if (res && res.value) {
          const t = JSON.parse(res.value);
          if (t && t.active && Array.isArray(t.wp) && t.wp.length > 1) {
            setWaypoints(t.wp.filter((id) => NODES[id]));
            setStays(t.stays && typeof t.stays === "object" ? t.stays : {});
            setTripMarks(t.marks || null);
            setTravel(t);
            setTab("travel");
          }
        }
      } catch (e) { /* no trip in progress */ }
    })();
  }, []);

  const startTravel = () => {
    const t = {
      active: true,
      startedISO: new Date().toISOString(),
      pos: 1, /* index of the stop we're heading to */
      wp: waypoints.slice(),
      stays: { ...stays },
      marks: tripMarks,
    };
    setTravel(t); persistTravel(t); setTravelView(null); setTab("travel");
    markVisited([route.stops[0]]);
  };
  const travelStep = (dir) => {
    if (!travel) return;
    if (dir > 0 && route.stops[travel.pos]) markVisited([route.stops[travel.pos]]);
    const pos = Math.max(1, Math.min(route.stops.length, travel.pos + dir));
    const t = { ...travel, pos };
    setTravel(t); persistTravel(t); setTravelView(null);
  };
  const endTravel = () => { setTravel(null); persistTravel(null); setTravelView(null); setTab("trip"); };

  const loadSuggested = (stops, staysObj = {}, marks = null) => {
    setTab("trip");
    setWaypoints(stops.filter((id) => NODES[id]));
    setStays(staysObj);
    setTripMarks(marks);
    setOpenIdx(null);
    setWx({ status: "idle", byId: {} });
  };

  const saveTrip = async () => {
    const name = (tripName || "My trip").trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trip";
    try {
      await window.storage.set("trips:" + slug, JSON.stringify(tripSnapshot()));
      setTripName("");
      listTrips();
    } catch (e) {
      setStorageOk(false);
    }
  };
  const loadTrip = async (key) => {
    try {
      const res = await window.storage.get(key);
      if (res && res.value) applySnapshot(JSON.parse(res.value));
    } catch (e) {
      listTrips();
    }
  };
  const deleteTrip = async (key) => {
    try { await window.storage.delete(key); } catch (e) { /* already gone */ }
    listTrips();
  };

  const route = useMemo(() => {
    if (waypoints.length < 2) return { stops: waypoints, segs: [] };
    let stops = [waypoints[0]];
    const segs = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const part = findPath(waypoints[i], waypoints[i + 1]);
      if (!part) return { stops: waypoints, segs: [] };
      for (let j = 1; j < part.length; j++) {
        const a = part[j - 1], b = part[j];
        const edge = ADJ[a].find((e) => e.to === b);
        segs.push({ a, b, km: edge.km, t: edge.t });
        stops.push(b);
      }
    }
    return { stops, segs };
  }, [waypoints]);

  const plan = useMemo(() => {
    const { stops, segs } = route;
    const segL = (s, factor) => (s.km * vehicle.real * factor * TERR[s.t]) / 100;
    const reserve = vehicle.tank * 0.2;

    let tank = vehicle.tank, litres = 0, soloLitres = 0, km = 0, premium = 0;
    const fills = {}, tight = {};
    const perDay = towing ? 450 : 550;
    const dayAt = [];

    let extraDays = 0;
    const seenStay = {};
    for (let i = 0; i < stops.length; i++) {
      dayAt.push((km <= 0 ? 1 : Math.floor((km - 1) / perDay) + 1) + extraDays);
      const sHere = Math.max(0, Number(stays[stops[i]]) || 0);
      if (sHere > 0 && !seenStay[stops[i]]) { seenStay[stops[i]] = true; extraDays += sHere; }
      const node = NODES[stops[i]];
      if (node.f && i < segs.length) {
        let need = 0, j = i;
        while (j < segs.length) {
          need += segL(segs[j], load.factor);
          if (NODES[stops[j + 1]].f) break;
          j++;
        }
        if (vehicle.tank < need + reserve) tight[stops[i]] = Math.round(need);
        if (tank < need + reserve) {
          const add = vehicle.tank - tank;
          if (add > 1) {
            fills[stops[i]] = { litres: add, price: price + node.d, cost: add * (price + node.d) };
            premium += add * node.d;
            tank = vehicle.tank;
          }
        }
      }
      if (i < segs.length) {
        if (segs[i].t === "y") {
          extraDays += 1; /* overnight ferry crossing — no fuel, no road km */
        } else {
          const L = segL(segs[i], load.factor);
          litres += L; soloLitres += segL(segs[i], 1); km += segs[i].km;
          tank = Math.max(0, tank - L);
        }
      }
    }

    const cityCost = litres * price;
    const cost = cityCost + premium;
    const soloCost = soloLitres * price;
    const days = Math.max(1, Math.ceil(km / perDay));

    let stayNightsTotal = 0, localLitres = 0, localCost = 0;
    [...new Set(stops)].forEach((sid) => {
      const sN = Math.max(0, Number(stays[sid]) || 0);
      if (sN > 0) {
        stayNightsTotal += sN;
        const L = (sN * 40 * vehicle.real) / 100; // ~40 km/day local driving, van unhitched
        localLitres += L;
        localCost += L * (price + NODES[sid].d);
      }
    });
    const fuelTotal = cost + localCost;
    return { km, litres, soloLitres, cost, soloCost, premium, fills, tight, days, dayAt,
             stayNightsTotal, localLitres, localCost, fuelTotal,
             fillCount: Object.keys(fills).length,
             avgCons: km > 0 ? (litres / km) * 100 : 0,
             added: cost - soloCost,
             addedPct: soloCost > 0 ? ((cost - soloCost) / soloCost) * 100 : 0,
             premiumPct: cityCost > 0 ? (premium / cityCost) * 100 : 0 };
  }, [route, vehicle, load, price, towing, stays]);

  const effNights = nights === "" ? plan.days + plan.stayNightsTotal : Math.max(1, Number(nights) || 1);
  const effNightly = nightly === "" ? STAY_RATES[stayStyle].rate : Math.max(0, Number(nightly) || 0);
  const budget = {
    stays: effNights * effNightly,
    food: effNights * Math.max(0, Number(foodPerDay) || 0),
  };
  budget.total = plan.fuelTotal + budget.stays + budget.food;
  const startId = waypoints[0];
  const endId = waypoints[waypoints.length - 1];
  const vanMake = VAN_DATA[vanMakeIdx];
  const trSize = TRAILER_SIZES[trSizeIdx];


  const travelCard = travel && route.segs.length > 0 ? (() => {
    const stops = route.stops, segs = route.segs;
    const tpos = Math.min(travel.pos, stops.length);
    const liveDone = tpos >= stops.length;
    const maxIdx = stops.length - 1;
    const liveIdx = Math.min(tpos, maxIdx);
    const v = travelView == null ? liveIdx : Math.max(0, Math.min(maxIdx, travelView));
    const browsing = travelView != null && v !== liveIdx;
    const vId = stops[v];
    const inLeg = v > 0 ? segs[v - 1] : null;
    const legL = inLeg && inLeg.t !== "y" ? (inLeg.km * vehicle.real * load.factor * TERR[inLeg.t]) / 100 : 0;
    const hereIdx = Math.max(0, tpos - 1);
    const dayN = plan.dayAt[hereIdx] || 1;
    let kmDone = 0, kmTotal = 0;
    segs.forEach((s, i) => { if (s.t !== "y") { kmTotal += s.km; if (i < tpos - 1) kmDone += s.km; } });
    const pct = kmTotal > 0 ? Math.round((kmDone / kmTotal) * 100) : 0;
    const fillHere = plan.fills[vId];
    let fillIdx = -1;
    for (let j = v + 1; j < stops.length; j++) { if (plan.fills[stops[j]]) { fillIdx = j; break; } }
    let fillKm = 0;
    if (fillIdx >= 0) for (let j = v; j < fillIdx; j++) { if (segs[j] && segs[j].t !== "y") fillKm += segs[j].km; }
    const nextFill = fillIdx >= 0 ? plan.fills[stops[fillIdx]] : null;
    const layN = Math.max(0, Number(stays[vId]) || 0);
    const w = wx.byId[vId];
    let kAt = 0;
    segs.forEach((s, i) => { if (i < v && s.t !== "y") kAt += s.km; });
    const scrollToGuide = () => {
      setOpenIdx(v);
      if (typeof document !== "undefined") {
        setTimeout(() => {
          const el = document.getElementById("jp-stop-" + v);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    };
    return (
      <div className="jp-card p-5 jp-travelcard jp-sec-travel">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="jp-eyebrow">🚐 Travel Mode</span>
          <span className="jp-chip jp-mono">Day {dayN} of ~{plan.days}</span>
        </div>

        {liveDone && !browsing ? (
          <>
            <p className="jp-travelbig">Trip complete — {NODES[stops[maxIdx]].n} 🎉</p>
            <p className="jp-note mb-2">{fmt(kmTotal)} km towed. Go on, tell the group.</p>
            {(() => {
              const logs = fillLog.filter((f) => f.trip === travel.startedISO);
              if (!logs.length) return null;
              const spent = logs.reduce((a, f) => a + f.$, 0);
              const plannedFuel = Math.round(Object.values(plan.fills).reduce((a, f) => a + (f.cost || 0), 0));
              return (
                <p className="jp-note mb-2">
                  ⛽ Fuel actually paid: <strong>${fmt(Math.round(spent))}</strong> — the plan said
                  {" "}${fmt(plannedFuel)}. {spent <= plannedFuel ? "Under budget. Shout yourself the bakery." : "Over — the road always gets a say."}
                </p>
              );
            })()}
          </>
        ) : (
          <>
            <p className="jp-note mb-1">
              {browsing
                ? (v < hereIdx ? "Looking back — stop " : "Looking ahead — stop ") + (v + 1) + " of " + stops.length + ":"
                : v === 0
                  ? "Trip start:"
                  : "Leaving " + NODES[stops[v - 1]].n + " — next stop:"}
            </p>
            <p className="jp-travelbig">{NODES[vId].n}</p>
            <p className="flex flex-wrap items-center gap-2 mb-2">
              {inLeg ? (
                inLeg.t === "y" ? (
                  <span className="jp-chip">⛴️ Spirit of Tasmania crossing — no driving that day</span>
                ) : (
                  <span className="jp-chip jp-mono">{fmt(inLeg.km)} km in · ~{Math.round(legL)} L</span>
                )
              ) : (
                <span className="jp-chip">Where it all begins</span>
              )}
              {inLeg && inLeg.t === "u" && (
                <span className="jp-chip jp-mono" style={{ color: "var(--red)", borderColor: "var(--red)" }}>unsealed</span>
              )}
              {browsing && <span className="jp-chip jp-mono">plan day {plan.dayAt[v]}</span>}
              {layN > 0 && <span className="jp-chip">🌙 {layN} {layN === 1 ? "night" : "nights"} here</span>}
              {w && <span className="jp-chip jp-mono">{wxInfo(w.code).e} {Math.round(w.tmax)}°</span>}
              {w && w.wind >= 40 && (
                <span className="jp-chip" style={{ color: "var(--red)", borderColor: "var(--red)" }}>
                  💨 wind to {Math.round(w.wind)} km/h — take care towing
                </span>
              )}
              {!NODES[vId].f && (
                <span className="jp-chip" style={{ color: "var(--red)", borderColor: "var(--red)" }}>No fuel here</span>
              )}
              {(() => {
                const cm = community[vId];
                const n = ((cm && cm.reports) || []).filter((r) => r.d && isFresh(r.d, 14)).length;
                return n > 0 ? (
                  <button type="button" className="jp-chip jp-chipbtn"
                          style={{ color: "var(--red)", borderColor: "var(--red)", fontWeight: 700 }}
                          onClick={scrollToGuide}>
                    ⚠️ {n} road report{n === 1 ? "" : "s"}
                  </button>
                ) : null;
              })()}
            </p>
            <p className="jp-note mb-2">
              {fillHere ? (
                <>⛽ Fill-up here — ~{Math.round(fillHere.litres)} L{fillHere.cost ? " (~$" + Math.round(fillHere.cost) + ")" : ""}.
                {livePrices[vId] && livePrices[vId].n > 0 ? (
                  <> <strong>Live today: from ${(livePrices[vId].min / 100).toFixed(2)}</strong> ({livePrices[vId].src}).</>
                ) : null}</>
              ) : nextFill ? (
                <>⛽ Next fill-up after here: <strong>{NODES[stops[fillIdx]].n}</strong> — {fmt(fillKm)} km on,
                {" "}~{Math.round(nextFill.litres)} L{nextFill.cost ? " (~$" + Math.round(nextFill.cost) + ")" : ""}.</>
              ) : (
                <>⛽ No more fill-ups needed from here.</>
              )}
            </p>
            <div className="jp-fillbox mb-2">
              {!logOpen ? (
                <button type="button" className="jp-preset"
                        onClick={() => {
                          setLogL(fillHere ? String(Math.round(fillHere.litres)) : "");
                          setLogD(fillHere && fillHere.cost ? String(Math.round(fillHere.cost)) : "");
                          setLogOpen(true);
                        }}>
                  ⛽ Log a fill-up at {NODES[vId].n}
                </button>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <input type="number" className="jp-field jp-mono jp-fillin" min="1" step="0.1"
                         placeholder="litres" aria-label="Litres filled"
                         value={logL} onChange={(e) => setLogL(e.target.value)} />
                  <span className="jp-note">L for $</span>
                  <input type="number" className="jp-field jp-mono jp-fillin" min="1" step="1"
                         placeholder="total" aria-label="Total dollars paid"
                         value={logD} onChange={(e) => setLogD(e.target.value)} />
                  <button type="button" className="jp-load" onClick={() => addFill(vId, kAt)}>Save</button>
                  <button type="button" className="jp-preset" onClick={() => setLogOpen(false)}>Cancel</button>
                </span>
              )}
              {(() => {
                const logs = fillLog.filter((f) => f.trip === travel.startedISO).sort((a, b) => a.k - b.k);
                if (!logs.length) return null;
                const last = logs[logs.length - 1];
                const paidRate = last.L > 0 ? last.$ / last.L : 0;
                const estRate = price + (NODES[last.id] ? NODES[last.id].d : 0);
                let consLine = null;
                if (logs.length >= 2) {
                  const kmSpan = logs[logs.length - 1].k - logs[0].k;
                  const litresUsed = logs.slice(1).reduce((a, f) => a + f.L, 0);
                  if (kmSpan > 30 && litresUsed > 0) {
                    const cons = (litresUsed / kmSpan) * 100;
                    const est = vehicle.real * load.factor;
                    consLine = (
                      <p className="jp-note mt-2 mb-1">
                        📈 Real consumption this trip: <strong>{cons.toFixed(1)} L/100 hitched</strong>
                        {" "}(my estimate: {est.toFixed(1)}).{" "}
                        {Math.abs(cons - est) <= est * 0.08
                          ? "Bang on."
                          : cons > est
                            ? "Thirstier than planned — wind, hills or a heavy right foot."
                            : "Better than planned — nice driving."}
                      </p>
                    );
                  }
                }
                const spent = logs.reduce((a, f) => a + f.$, 0);
                return (
                  <>
                    {consLine}
                    <p className="jp-note mt-2 mb-1">
                      Last fill: {NODES[last.id] ? NODES[last.id].n : "?"} — {last.L} L at
                      {" "}${paidRate.toFixed(2)}/L (I estimated ${estRate.toFixed(2)}) ·
                      trip fuel so far <strong>${fmt(Math.round(spent))}</strong>.
                    </p>
                    <span className="flex flex-wrap gap-2">
                      {logs.slice(-3).map((f) => (
                        <span key={f.trip + "-" + f.k + "-" + f.d} className="jp-chip jp-mono">
                          {NODES[f.id] ? NODES[f.id].n : "?"} {f.L} L
                          <button type="button" className="jp-fillx" aria-label="Remove this fill"
                                  onClick={() => removeFill(f)}>×</button>
                        </span>
                      ))}
                    </span>
                  </>
                );
              })()}
            </div>
          </>
        )}

        <input type="range" className="jp-scrub" min={0} max={maxIdx} step={1} value={v}
               onChange={(e) => setTravelView(Number(e.target.value))}
               aria-label="Slide to browse every stop on this trip" />
        <p className="jp-note mb-3">
          {tpos - 1} of {segs.length} legs done · {fmt(kmDone)} of {fmt(kmTotal)} km ({pct}%)
          {browsing && <> · you&rsquo;re at <strong>{NODES[stops[hereIdx]].n}</strong></>}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {browsing ? (
            <>
              <button type="button" className="jp-load" onClick={() => setTravelView(null)}>◀ Back to today</button>
              <button type="button" className="jp-preset"
                      onClick={() => {
                        markVisited([stops[v]]);
                        const t = { ...travel, pos: Math.min(stops.length, v + 1) };
                        setTravel(t); persistTravel(t); setTravelView(null);
                      }}>✓ I&rsquo;m here now</button>
            </>
          ) : liveDone ? (
            <button type="button" className="jp-load" onClick={endTravel}>Finish &amp; exit Travel Mode</button>
          ) : (
            <>
              <button type="button" className="jp-load" onClick={() => travelStep(1)}>
                ✓ Arrived at {NODES[vId].n}
              </button>
              {tpos > 1 && (
                <button type="button" className="jp-preset" onClick={() => travelStep(-1)}>Back one</button>
              )}
            </>
          )}
          {!(liveDone && !browsing) && (
            <button type="button" className="jp-preset" onClick={scrollToGuide}>Stop guide ↓</button>
          )}
          <button type="button" className="jp-preset" onClick={makeStory} disabled={storyBusy}>📸 Share</button>
          {!liveDone && (
            <button type="button" className="jp-preset" onClick={endTravel}>End trip</button>
          )}
        </div>
      </div>
    );
  })() : null;

  return (
    <div className="jp-root min-h-screen w-full" data-tab={tab}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .jp-root {
          --sign: #00674F; --sign-deep: #00543f; --amber: #F5B301;
          --paper: #F5F4EE; --card: #FFFFFF; --ink: #21262A;
          --muted: #6B7069; --line: #DDDCD2; --red: #C03B2B;
          background: var(--paper); color: var(--ink);
          font-family: 'Archivo', system-ui, sans-serif;
        }
        .jp-main { display: grid; grid-template-columns: 1fr; gap: 1.5rem; align-items: start; }
        @media (min-width: 880px) { .jp-main { grid-template-columns: 5fr 7fr; } }
        .jp-statgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        @media (min-width: 620px) { .jp-statgrid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .jp-pickgrid { display: grid; grid-template-columns: 1fr; gap: 0.6rem; }
        @media (min-width: 480px) { .jp-pickgrid { grid-template-columns: 1fr 1fr; } }
        .jp-display { font-family: 'Barlow Condensed', sans-serif; }
        .jp-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .jp-eyebrow {
          font-family: 'Barlow Condensed', sans-serif; font-weight: 600; font-size: 0.8rem;
          letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
        }
        .jp-field {
          width: 100%; background: var(--card); color: var(--ink);
          border: 1.5px solid var(--line); border-radius: 10px;
          padding: 0.7rem 0.85rem; font-size: 1rem; font-family: inherit;
        }
        .jp-field:focus-visible { outline: 3px solid var(--amber); outline-offset: 1px; border-color: var(--ink); }
        .jp-chip {
          display: inline-flex; align-items: center; gap: 0.35rem;
          background: var(--paper); border: 1px solid var(--line); border-radius: 999px;
          padding: 0.2rem 0.65rem; font-size: 0.78rem; color: var(--muted); font-weight: 500;
        }
        .jp-sign {
          background: var(--sign); color: #fff; border-radius: 18px;
          border: 4px solid #fff; outline: 2px solid var(--sign-deep);
          box-shadow: 0 18px 40px -18px rgba(0, 84, 63, 0.55);
        }
        .jp-sign-rule { border-top: 2px solid rgba(255,255,255,0.28); }
        .jp-diamond {
          width: 14px; height: 14px; background: var(--amber);
          border: 2px solid var(--ink); transform: rotate(45deg); flex: none;
        }
        .jp-bar { height: 12px; border-radius: 999px; background: rgba(255,255,255,0.22); overflow: hidden; }
        .jp-bar > span { display: block; height: 100%; border-radius: 999px; transition: width 220ms ease; }
        @media (prefers-reduced-motion: reduce) { .jp-bar > span { transition: none; } }
        .jp-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 16px; }
        .jp-note { font-size: 0.82rem; color: var(--muted); line-height: 1.45; }
        .jp-wp {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: var(--ink); color: #fff; border-radius: 999px;
          padding: 0.35rem 0.5rem 0.35rem 0.8rem; font-size: 0.85rem; font-weight: 600;
        }
        .jp-wp button { display: inline-flex; background: rgba(255,255,255,0.18); border: 0; border-radius: 999px;
          color: #fff; padding: 0.15rem; cursor: pointer; }
        .jp-wp button:focus-visible { outline: 2px solid var(--amber); }
        .jp-preset {
          background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px;
          padding: 0.35rem 0.8rem; font-size: 0.8rem; font-weight: 600; color: var(--ink);
          cursor: pointer; font-family: inherit;
        }
        .jp-preset:focus-visible { outline: 3px solid var(--amber); }
        .jp-preset[data-on="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
        .jp-stopbtn {
          width: 100%; background: none; border: 0; padding: 0.45rem 0; margin: 0;
          font: inherit; color: inherit; text-align: left; cursor: pointer;
          display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem;
        }
        .jp-stopbtn:focus-visible { outline: 3px solid var(--amber); outline-offset: 2px; border-radius: 8px; }
        .jp-guide {
          background: var(--paper); border: 1px solid var(--line); border-radius: 12px;
          padding: 0.8rem 0.9rem; margin: 0.2rem 0 0.5rem 1.35rem;
          display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.85rem;
        }
        .jp-guide a { color: var(--sign); font-weight: 600; text-decoration: underline; }
        .jp-seg { display: flex; align-items: center; gap: 0.5rem; color: var(--muted);
          font-size: 0.75rem; padding-left: 1.35rem; }
        .jp-seg::before { content: ""; width: 2px; height: 1.15rem; background: var(--line);
          margin-left: 4px; border-radius: 2px; }
        .jp-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--line);
          flex: none; align-self: center; }
        .jp-dot[data-major="true"] { background: var(--sign); outline: 3px solid rgba(0,103,79,0.2); }
        .jp-fill {
          display: inline-block; background: var(--amber); color: var(--ink);
          border-radius: 6px; padding: 0.1rem 0.5rem; font-size: 0.75rem; font-weight: 700;
        }
        .jp-tag { display: inline-block; border: 1px solid var(--line); color: var(--muted);
          border-radius: 6px; padding: 0.05rem 0.4rem; font-size: 0.68rem; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase; }
        .jp-range { width: 100%; accent-color: var(--sign); }
        .jp-mapwrap { position: relative; }
        .jp-map { height: 340px; border-radius: 12px; border: 1.5px solid var(--line);
          background: #E9E8DF; overflow: hidden; z-index: 0; }
        @media (min-width: 880px) { .jp-map { height: 400px; } }
        .jp-tiles { filter: saturate(0.72) contrast(0.96) brightness(1.03) sepia(0.14); }
        .jp-maploading { position: absolute; inset: 0; display: flex; align-items: center;
          justify-content: center; gap: 0.5rem; color: var(--muted); font-size: 0.85rem;
          pointer-events: none; }
        .jp-mapdiamond { display: block; width: 17px; height: 17px; background: var(--amber);
          border: 2.5px solid var(--ink); transform: rotate(45deg); margin: 3px;
          box-shadow: 0 2px 6px rgba(33,38,42,0.4); }
        .jp-mapdiamond i { display: flex; width: 100%; height: 100%; align-items: center;
          justify-content: center; transform: rotate(-45deg); font-style: normal;
          font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 600;
          color: var(--ink); }
        .jp-pop { font-family: 'Archivo', system-ui, sans-serif; color: var(--ink); min-width: 150px; }
        .jp-popname { font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
          font-size: 1.05rem; margin: 0; }
        .jp-popname span { color: var(--muted); font-weight: 600; font-size: 0.85rem; }
        .jp-poprow { margin: 0.3rem 0 0; display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .jp-popchip { display: inline-block; border: 1px solid var(--line); border-radius: 6px;
          padding: 0.05rem 0.4rem; font-size: 0.72rem; font-weight: 600; background: var(--paper); }
        .jp-popfill { background: var(--amber); border-color: var(--ink); }
        .jp-popred { color: var(--red); border-color: var(--red); }
        .jp-popkind { margin: 0.35rem 0 0; font-size: 0.72rem; color: var(--muted);
          text-transform: uppercase; letter-spacing: 0.06em;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 600; }
        .leaflet-popup-content-wrapper { border-radius: 12px; border: 1.5px solid var(--line);
          box-shadow: 0 10px 24px -12px rgba(33,38,42,0.35); }
        .leaflet-popup-content { margin: 10px 12px; }
        .jp-key { display: inline-block; width: 9px; height: 9px; vertical-align: -1px; }
        .jp-key-d { background: var(--amber); border: 1.5px solid var(--ink); transform: rotate(45deg); }
        .jp-key-r { background: var(--sign); border-radius: 999px; border: 1.5px solid #fff; }
        .jp-key-f { background: var(--amber); border-radius: 999px; border: 1.5px solid var(--ink); }
        .jp-key-u { background: var(--amber); border: 1.5px dashed var(--ink); }
        .jp-triprow { width: 100%; background: none; border: 0; border-top: 1px solid var(--line);
          padding: 0.6rem 0; margin: 0; font: inherit; color: inherit; text-align: left;
          display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; cursor: pointer; }
        .jp-triprow:focus-visible { outline: 3px solid var(--amber); outline-offset: 2px; border-radius: 8px; }
        .jp-load { background: var(--sign); color: #fff; border: 0; border-radius: 999px;
          padding: 0.45rem 1.1rem; font-weight: 700; font-family: inherit; font-size: 0.85rem; cursor: pointer; }
        .jp-load:focus-visible { outline: 3px solid var(--amber); outline-offset: 1px; }
        .jp-wkpick { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
          width: 100%; background: var(--paper); border: 1.5px solid var(--line); border-radius: 10px;
          padding: 0.55rem 0.8rem; font: inherit; color: inherit; cursor: pointer; text-align: left; }
        .jp-wkpick:focus-visible { outline: 3px solid var(--amber); }
        .jp-mapdiamond-red { background: var(--red); border-color: #fff; }
        .jp-mapdiamond-red i { color: #fff; }
        .jp-mapdiamond-end { box-shadow: 0 0 0 3px var(--red), 0 2px 6px rgba(33,38,42,0.4); }
        .jp-key-p { background: var(--sign); opacity: 0.5; border-radius: 2px; }
        .jp-travelcard { border: 2px solid var(--sign); }
        .jp-travelbig { font-family: 'Barlow Condensed', sans-serif; font-weight: 700;
          font-size: 1.9rem; line-height: 1.05; margin: 0 0 0.4rem; }
        .jp-tprog { height: 10px; background: #E4E3D9; border-radius: 999px;
          border: 1px solid var(--line); overflow: hidden; }
        .jp-tprogfill { height: 100%; background: var(--sign); border-radius: 999px;
          transition: width 300ms; }
        .jp-startbtn { width: 100%; margin-top: 1.1rem; background: var(--amber); color: var(--ink);
          border: 2px solid var(--ink); border-radius: 12px; padding: 0.7rem 1rem;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1.05rem;
          letter-spacing: 0.02em; cursor: pointer; }
        .jp-startbtn:focus-visible { outline: 3px solid #fff; }
        .jp-sharebtn { width: 100%; margin-top: 0.6rem; background: transparent; color: #fff;
          border: 2px solid rgba(255,255,255,0.85); border-radius: 12px; padding: 0.6rem 1rem;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1rem;
          letter-spacing: 0.02em; cursor: pointer; }
        .jp-sharebtn:focus-visible { outline: 3px solid var(--amber); }
        .jp-sharebtn:disabled { opacity: 0.6; cursor: wait; }
        .jp-modal { position: fixed; inset: 0; background: rgba(33,38,42,0.6); z-index: 60;
          display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .jp-modalcard { max-width: 420px; width: 100%; max-height: 92vh; overflow: auto; }
        .jp-modalimg { width: 100%; height: auto; display: block; border-radius: 12px;
          border: 1.5px solid var(--line); }
        .jp-scrub { width: 100%; accent-color: var(--sign); height: 28px; margin: 0.1rem 0 0.25rem;
          cursor: pointer; }
        .jp-scrub:focus-visible { outline: 3px solid var(--amber); outline-offset: 2px; border-radius: 8px; }
        .jp-popvis { background: var(--sign); color: #fff; border-color: var(--sign); }
        .jp-popvisit { display: block; margin-top: 0.45rem; width: 100%; background: var(--sign);
          color: #fff; border: 0; border-radius: 8px; padding: 0.4rem 0.6rem;
          font: 600 0.78rem 'Archivo', system-ui, sans-serif; cursor: pointer; }
        .jp-journal { border-top: 1.5px dashed var(--line); padding-top: 0.6rem; }
        .jp-star { background: none; border: 0; font-size: 1.35rem; line-height: 1;
          color: var(--amber); cursor: pointer; padding: 0.1rem; }
        .jp-star:focus-visible { outline: 3px solid var(--amber); border-radius: 6px; }
        .jp-notearea { resize: vertical; min-height: 4.2rem; font-size: 0.85rem; width: 100%; }
        .jp-thumbwrap { position: relative; display: inline-block; }
        .jp-thumb { padding: 0; border: 1.5px solid var(--line); border-radius: 10px; overflow: hidden;
          width: 72px; height: 72px; cursor: zoom-in; background: #fff; }
        .jp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .jp-thumbx { position: absolute; top: -7px; right: -7px; width: 22px; height: 22px;
          border-radius: 999px; background: var(--ink); color: #fff; border: 2px solid #fff;
          font-size: 0.8rem; line-height: 1; cursor: pointer; }
        .jp-thumbx:focus-visible, .jp-thumb:focus-visible { outline: 3px solid var(--amber); }
        .jp-community { border-top: 1.5px dashed var(--line); padding-top: 0.6rem; }
        .jp-report { margin: 0 0 0.3rem; font-size: 0.85rem; color: var(--red); }
        .jp-travnote { margin: 0 0 0.35rem; font-size: 0.85rem; }
        .jp-repmeta { color: var(--muted); font-size: 0.75rem; }
        .jp-handle { display: inline-block; width: 9.5rem; padding: 0.15rem 0.45rem; font-size: 0.78rem; }
        .jp-chipbtn { cursor: pointer; background: var(--paper); }
        .jp-livefuel { background: #EAF3EF; border: 1.5px solid var(--sign); border-radius: 10px;
          padding: 0.4rem 0.6rem; font-size: 0.85rem; margin: 0.35rem 0; }
        .jp-towrow { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0 0 0.45rem;
          font-size: 0.88rem; }
        .jp-towglyph { font-weight: 800; width: 1.1rem; flex: none; text-align: center; }
        .jp-fillbox { background: #FFF8E6; border: 1.5px dashed var(--amber); border-radius: 10px;
          padding: 0.5rem 0.6rem; }
        .jp-fillin { width: 5.6rem; padding: 0.3rem 0.5rem; }
        .jp-fillx { margin-left: 0.35rem; border: 0; background: none; color: var(--red);
          font-weight: 800; cursor: pointer; font-size: 0.85rem; }
        .jp-fillx:focus-visible { outline: 2px solid var(--red); border-radius: 4px; }
        .jp-sharedbanner { border: 2px solid var(--amber); background: #FFF8E6; }
        .jp-offline { background: var(--amber); color: var(--ink); border-bottom: 2px solid var(--ink);
          padding: 0.5rem 0.9rem; text-align: center; font-weight: 600; font-size: 0.85rem; }
        .jp-tabbar { display: none; }
        .jp-mobileonly { display: none; }
        @media (max-width: 900px) {
          .jp-root { padding-bottom: 4.9rem; }
          .jp-tabbar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 60;
            display: flex; background: #FFFFFF; border-top: 2px solid var(--ink);
            box-shadow: 0 -4px 14px rgba(33,38,42,0.08);
            padding: 0.3rem 0.2rem calc(0.3rem + env(safe-area-inset-bottom, 0px)); }
          .jp-tabbtn { flex: 1; background: none; border: 0; cursor: pointer;
            font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 0.8rem;
            letter-spacing: 0.02em; color: var(--muted);
            display: flex; flex-direction: column; align-items: center; gap: 2px;
            padding: 0.3rem 0; min-height: 52px; }
          .jp-tabbtn .jp-tabicon { font-size: 1.35rem; line-height: 1; }
          .jp-tabbtn[data-on="true"] { color: var(--sign); }
          .jp-tabbtn:focus-visible { outline: 3px solid var(--amber); border-radius: 10px; }
          /* one page at a time on the phone */
          .jp-sec-rig, .jp-sec-plan, .jp-sec-trip, .jp-sec-travel, .jp-sec-mymap { display: none; }
          [data-tab="rig"] .jp-sec-rig { display: block; }
          [data-tab="plan"] .jp-sec-plan { display: block; }
          [data-tab="trip"] .jp-sec-trip { display: block; }
          [data-tab="travel"] .jp-sec-travel { display: block; }
          [data-tab="travel"] .jp-mobileonly { display: block; }
          [data-tab="mymap"] .jp-sec-mymap { display: block; }
        }
      `}</style>

      <header className="max-w-6xl mx-auto px-4 pt-8 pb-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Route size={26} strokeWidth={2.4} style={{ color: "var(--sign)" }} aria-hidden />
              <h1 className="jp-display text-4xl font-bold tracking-wide">
                JOURNEY<span style={{ color: "var(--sign)" }}>PRO</span>
              </h1>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Plan the trip before you tow.
            </p>
          </div>
          <span className="jp-display text-sm font-semibold tracking-widest uppercase px-3 py-1 rounded-md"
                style={{ background: "var(--amber)", color: "var(--ink)" }}>
            Prototype v0.30
          </span>
        </div>
      </header>

      {offline && (
        <div className="jp-offline" role="status">
          📡 Offline — your plans, guides and trip keep working. Live prices, weather and fresh
          map tiles return with reception.
        </div>
      )}
      <main className="jp-main max-w-6xl mx-auto px-4 py-6">
        <section className="flex flex-col gap-5">
          <div className="jp-card p-5 jp-sec-rig">
            <div className="flex items-center gap-2 mb-3">
              <Caravan size={18} style={{ color: "var(--sign)" }} aria-hidden />
              <span className="jp-eyebrow">Your tow vehicle</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Vehicle entry mode">
              {[["list", "Pick from list"], ["custom", "Enter my own"]].map(([id, lbl]) => (
                <button key={id} type="button" className="jp-preset" data-on={vehMode === id}
                        onClick={() => setVehMode(id)}>
                  {lbl}
                </button>
              ))}
            </div>

            {vehMode === "list" && (<>
            <div className="jp-pickgrid">
              <div>
                <label className="block text-sm font-semibold mb-1" htmlFor="mk">Make</label>
                <select id="mk" className="jp-field" value={makeIdx} onChange={(e) => changeMake(Number(e.target.value))}>
                  {MAKE_ORDER.map((i) => <option key={VEHICLE_DATA[i].make} value={i}>{VEHICLE_DATA[i].make}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" htmlFor="md">Model</label>
                <select id="md" className="jp-field" value={Math.min(modelIdx, make.models.length - 1)}
                        onChange={(e) => changeModel(Number(e.target.value))}>
                  {MODEL_ORDER[makeIdx].map((i) => <option key={make.models[i].model} value={i}>{make.models[i].model}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-semibold mb-1" htmlFor="vr">Series / engine</label>
              <select id="vr" className="jp-field" value={Math.min(variantIdx, model.variants.length - 1)}
                      onChange={(e) => changeVariant(Number(e.target.value))}>
                {model.variants.map((v, i) => (
                  <option key={v.v} value={i}>{v.v} · {v.yr}</option>
                ))}
              </select>
            </div>
            </>)}

            {vehMode === "custom" && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1" htmlFor="cvn">Vehicle name</label>
                  <input id="cvn" type="text" className="jp-field" value={customVeh.name}
                         onChange={(e) => setCustomVeh({ ...customVeh, name: e.target.value })} />
                </div>
                <div className="jp-pickgrid">
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="cvf">Fuel type</label>
                    <select id="cvf" className="jp-field" value={customVeh.fuel}
                            onChange={(e) => { setCustomVeh({ ...customVeh, fuel: e.target.value }); setPrice(FUEL_META[e.target.value].defaultPrice); }}>
                      {Object.entries(FUEL_META).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="cvt">Tank (L)</label>
                    <input id="cvt" type="number" min="10" step="1" className="jp-field jp-mono" value={customVeh.tank}
                           onChange={(e) => setCustomVeh({ ...customVeh, tank: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="cvr">Real-world L/100km</label>
                    <input id="cvr" type="number" min="3" step="0.1" className="jp-field jp-mono" value={customVeh.real}
                           onChange={(e) => setCustomVeh({ ...customVeh, real: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="cvw">Tows (kg, braked)</label>
                    <input id="cvw" type="number" min="0" step="100" className="jp-field jp-mono" value={customVeh.tow}
                           onChange={(e) => setCustomVeh({ ...customVeh, tow: e.target.value })} />
                  </div>
                  <div>
                    <label className="jp-lab" htmlFor="cvb">Ball limit kg <span className="jp-note">(optional)</span></label>
                    <input id="cvb" type="number" min="0" step="10" className="jp-field jp-mono" value={customVeh.ball}
                           placeholder="e.g. 350"
                           onChange={(e) => setCustomVeh({ ...customVeh, ball: e.target.value })} />
                  </div>
                  <div>
                    <label className="jp-lab" htmlFor="cvk">Kerb weight kg <span className="jp-note">(optional)</span></label>
                    <input id="cvk" type="number" min="0" step="10" className="jp-field jp-mono" value={customVeh.kerb}
                           placeholder="e.g. 2350"
                           onChange={(e) => setCustomVeh({ ...customVeh, kerb: e.target.value })} />
                  </div>
                  <div>
                    <label className="jp-lab" htmlFor="cvg">GVM kg <span className="jp-note">(optional)</span></label>
                    <input id="cvg" type="number" min="0" step="10" className="jp-field jp-mono" value={customVeh.gvm}
                           placeholder="e.g. 3350"
                           onChange={(e) => setCustomVeh({ ...customVeh, gvm: e.target.value })} />
                  </div>
                </div>
                <p className="jp-note">Tip: your trip computer&rsquo;s long-term average is the honest number to use.</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="jp-chip">{fuelLabel}</span>
              <span className="jp-chip">{vehicle.tank} L tank</span>
              <span className="jp-chip">~{vehicle.real} L/100km solo</span>
              <span className="jp-chip">Tows {fmt(vehicle.tow)} kg</span>
            </div>
          </div>

          <div className="jp-card p-5 jp-sec-rig">
            <div className="flex items-center gap-2 mb-3">
              <Caravan size={18} style={{ color: "var(--sign)" }} aria-hidden />
              <span className="jp-eyebrow">On the back</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Towing type">
              {[["none", "Nothing"], ["caravan", "Caravan / camper"], ["trailer", "Trailer"]].map(([id, lbl]) => (
                <button key={id} type="button" className="jp-preset" data-on={towType === id}
                        onClick={() => { setTowType(id); setLoadPct(id === "trailer" ? 60 : 85); }}>
                  {lbl}
                </button>
              ))}
            </div>

            {towType === "caravan" && (
              <>
                <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Caravan entry mode">
                  {[["list", "Pick from list"], ["custom", "Enter my own van"]].map(([id, lbl]) => (
                    <button key={id} type="button" className="jp-preset" data-on={vanMode === id}
                            onClick={() => setVanMode(id)}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {vanMode === "custom" && (
                  <div className="jp-pickgrid">
                    <div>
                      <label className="block text-sm font-semibold mb-1" htmlFor="cvs">Style</label>
                      <select id="cvs" className="jp-field" value={customVan.style}
                              onChange={(e) => setCustomVan({ ...customVan, style: e.target.value })}>
                        <option value="camper">Camper trailer</option>
                        <option value="pop">Pop-top</option>
                        <option value="full">Full-height</option>
                        <option value="off">Off-road full-height</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1" htmlFor="cvl">Length (ft)</label>
                      <input id="cvl" type="number" min="8" step="0.5" className="jp-field jp-mono" value={customVan.len}
                             onChange={(e) => setCustomVan({ ...customVan, len: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1" htmlFor="cvta">Tare (kg)</label>
                      <input id="cvta" type="number" min="200" step="10" className="jp-field jp-mono" value={customVan.tare}
                             onChange={(e) => setCustomVan({ ...customVan, tare: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1" htmlFor="cvam">ATM (kg)</label>
                      <input id="cvam" type="number" min="300" step="10" className="jp-field jp-mono" value={customVan.atm}
                             onChange={(e) => setCustomVan({ ...customVan, atm: e.target.value })} />
                    </div>
                  </div>
                )}
                {vanMode === "list" && (
                <div className="jp-pickgrid">
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="vmk">Make</label>
                    <select id="vmk" className="jp-field" value={vanMakeIdx}
                            onChange={(e) => { setVanMakeIdx(Number(e.target.value)); setVanModelIdx(0); }}>
                      {VAN_MAKE_ORDER.map((i) => <option key={VAN_DATA[i].make} value={i}>{VAN_DATA[i].make}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="vmd">Model</label>
                    <select id="vmd" className="jp-field" value={Math.min(vanModelIdx, vanMake.models.length - 1)}
                            onChange={(e) => setVanModelIdx(Number(e.target.value))}>
                      {VAN_MODEL_ORDER[vanMakeIdx].map((i) => <option key={vanMake.models[i].m} value={i}>{vanMake.models[i].m}</option>)}
                    </select>
                  </div>
                </div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="jp-chip">{load.sub}</span>
                  <span className="jp-chip">Tare {fmt(load.tare)} kg</span>
                  <span className="jp-chip">ATM {fmt(load.atm)} kg</span>
                </div>
              </>
            )}

            {towType === "trailer" && (
              <>
                <div className="jp-pickgrid">
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="tsz">Size</label>
                    <select id="tsz" className="jp-field" value={trSizeIdx}
                            onChange={(e) => { const i = Number(e.target.value); setTrSizeIdx(i); setTrAtm(TRAILER_SIZES[i].atms[0]); }}>
                      {TRAILER_SIZES.map((t, i) => <option key={t.id} value={i}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1" htmlFor="trt">Rating (ATM)</label>
                    <select id="trt" className="jp-field" value={trAtm} onChange={(e) => setTrAtm(Number(e.target.value))}>
                      {trSize.atms.map((a) => <option key={a} value={a}>{fmt(a)} kg</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="jp-chip">Tare {fmt(load.tare)} kg</span>
                  <span className="jp-chip">Carrying ~{fmt(load.payload)} kg</span>
                </div>
              </>
            )}

            {towType !== "none" && (
              <div className="mt-4">
                <label className="block text-sm font-semibold mb-1" htmlFor="ld">
                  How loaded? <span className="jp-mono" style={{ color: "var(--muted)" }}>{loadPct}%</span>
                </label>
                <input id="ld" type="range" min="0" max="100" step="5" className="jp-range"
                       value={loadPct} onChange={(e) => setLoadPct(Number(e.target.value))} />
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="jp-chip"><strong>Towed weight ~{fmt(load.weight)} kg</strong></span>
                  <span className="jp-chip">Fuel use +{fmt((load.factor - 1) * 100)}%</span>
                </div>
              </div>
            )}

            {overWeight && (
              <div className="mt-3 flex items-start gap-2 rounded-lg p-3"
                   style={{ background: "#FBEAE6", border: "1.5px solid var(--red)" }}>
                <AlertTriangle size={18} style={{ color: "var(--red)" }} className="mt-0.5" aria-hidden />
                <p className="text-sm font-medium" style={{ color: "var(--red)" }}>
                  At ~{fmt(load.weight)} kg this load is over the {fmt(vehicle.tow)} kg braked towing
                  limit. Lighten the load or pick a bigger tug.
                </p>
              </div>
            )}
            {overAtm && (
              <p className="jp-note mt-3">
                ⚠ Heads-up: this unit&rsquo;s full {fmt(load.atm)} kg ATM rating exceeds the vehicle&rsquo;s
                {" "}{fmt(vehicle.tow)} kg limit — you&rsquo;re only legal while it stays lightly loaded.
              </p>
            )}
          </div>

          {load.weight > 0 && (() => {
            const ballEst = Math.round(load.weight * 0.10);
            const rows = [];
            /* A — towed weight vs braked limit */
            rows.push(load.weight > vehicle.tow
              ? { s: "bad", t: <>Towed weight ~{fmt(load.weight)} kg is <strong>over</strong> the {fmt(vehicle.tow)} kg braked limit.</> }
              : load.weight > vehicle.tow * 0.95
                ? { s: "warn", t: <>Towed weight ~{fmt(load.weight)} kg is within {fmt(vehicle.tow)} kg — but only just. No margin for the firewood.</> }
                : { s: "ok", t: <>Towed weight ~{fmt(load.weight)} kg sits under the {fmt(vehicle.tow)} kg braked limit.</> });
            /* B — towball estimate vs ball limit */
            if (vehicle.ball) {
              rows.push(ballEst > vehicle.ball
                ? { s: "bad", t: <>Estimated ball weight ~{ballEst} kg (10%) <strong>exceeds</strong> this vehicle&rsquo;s {vehicle.ball} kg towball limit.</> }
                : ballEst > vehicle.ball * 0.9
                  ? { s: "warn", t: <>Estimated ball weight ~{ballEst} kg is right at this vehicle&rsquo;s {vehicle.ball} kg towball limit — load the van nose-light and verify with a ball scale.</> }
                  : { s: "ok", t: <>Estimated ball weight ~{ballEst} kg fits the {vehicle.ball} kg towball limit.</> });
            } else {
              rows.push({ s: "info", t: <>Estimated ball weight ~{ballEst} kg (10% rule). This vehicle&rsquo;s ball limit isn&rsquo;t in my data — check the towbar plate or handbook (utes are typically 350 kg; SUVs can be as low as 100–250 kg).</> });
            }
            /* C — van vs tug stability */
            if (vehicle.kerb) {
              rows.push(load.weight > vehicle.kerb
                ? { s: "warn", t: <>The loaded van (~{fmt(load.weight)} kg) outweighs the tug (~{fmt(vehicle.kerb)} kg kerb). Legal in most cases, but it demands respect: correct ball weight, electronic sway control, and consider a weight-distribution hitch.</> }
                : { s: "ok", t: <>The tug (~{fmt(vehicle.kerb)} kg kerb) outweighs the van — the stable way around.</> });
            }
            /* D — GVM payload window */
            if (vehicle.gvm && vehicle.kerb) {
              const window_ = vehicle.gvm - vehicle.kerb;
              const afterBall = window_ - ballEst;
              rows.push(afterBall < 150
                ? { s: "bad", t: <>GVM payload window is {fmt(window_)} kg; ball weight uses ~{ballEst} kg, leaving <strong>~{fmt(afterBall)} kg</strong> for people, gear, water and accessories — very likely over GVM once loaded. A GVM upgrade or lighter van may be needed.</> }
                : afterBall < 400
                  ? { s: "warn", t: <>GVM payload window is {fmt(window_)} kg; ball weight uses ~{ballEst} kg, leaving ~{fmt(afterBall)} kg for people, gear, water and accessories. Tight — pack like a minimalist and weigh it.</> }
                  : { s: "ok", t: <>GVM payload window is {fmt(window_)} kg; after ~{ballEst} kg of ball weight there&rsquo;s ~{fmt(afterBall)} kg for people, gear and water.</> });
            }
            const worst = rows.some((r) => r.s === "bad") ? "bad" : rows.some((r) => r.s === "warn") ? "warn" : "ok";
            const glyph = { ok: "✓", warn: "⚠", bad: "✗", info: "ℹ" };
            const col = { ok: "var(--sign)", warn: "#8a6d00", bad: "var(--red)", info: "var(--muted)" };
            return (
              <div className="jp-card p-5 jp-sec-rig">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="jp-eyebrow">🛟 Safe Tow Check</span>
                  <span className="jp-chip" style={{
                    background: worst === "ok" ? "var(--sign)" : worst === "warn" ? "var(--amber)" : "var(--red)",
                    color: worst === "warn" ? "var(--ink)" : "#fff",
                    borderColor: "var(--ink)", fontWeight: 700 }}>
                    {worst === "ok" ? "Looking good" : worst === "warn" ? "Check the details" : "Not safe as set up"}
                  </span>
                </div>
                {rows.map((r, i) => (
                  <p key={i} className="jp-towrow">
                    <span className="jp-towglyph" style={{ color: col[r.s] }} aria-hidden>{glyph[r.s]}</span>
                    <span>{r.t}</span>
                  </p>
                ))}
                {vehMode === "custom" && (!vehicle.ball || !vehicle.kerb || !vehicle.gvm) && (
                  <p className="jp-note mt-2">Custom rig? Add ball limit, kerb weight and GVM in the vehicle card for the full check.</p>
                )}
                <p className="jp-note mt-2">
                  Guide only, based on standard-model specs — your compliance plates rule, options change weights,
                  and GCM isn&rsquo;t checked yet. The only numbers that truly count come off a
                  {" "}<strong>weighbridge with the rig loaded</strong>. Ball weight here is the 10% rule of thumb.
                </p>
              </div>
            );
          })()}

          <div className="jp-card p-5 jp-sec-plan jp-sec-plan">
            <div className="flex items-center gap-2 mb-3">
              <Route size={18} style={{ color: "var(--sign)" }} aria-hidden />
              <span className="jp-eyebrow">Build your trip</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {waypoints.map((id, i) => (
                <span className="jp-wp" key={id + "-" + i}>
                  {i === 0 ? "Start: " : ""}{NODES[id].n}
                  <button type="button" aria-label={"Remove " + NODES[id].n} onClick={() => removeStop(i)}>
                    <X size={13} aria-hidden />
                  </button>
                </span>
              ))}
            </div>

            {waypoints.length === 0 && (
              <p className="jp-note mb-3">Trip cleared — choose your starting point below.</p>
            )}

            <label className="block text-sm font-semibold mb-1" htmlFor="add">
              <span className="inline-flex items-center gap-1"><Plus size={14} aria-hidden /> Add a stop</span>
            </label>
            <select id="add" className="jp-field" value="" onChange={(e) => addStop(e.target.value)}>
              <option value="">{waypoints.length === 0 ? "Choose your starting point…" : "Choose a town or roadhouse…"}</option>
              {STATE_GROUPS.map(([st, label]) => (
                <optgroup key={st} label={label}>
                  {Object.entries(NODES).filter(([, n]) => n.st === st)
                    .sort((a, b) =>
                      (a[1].k === "city" ? 0 : 1) - (b[1].k === "city" ? 0 : 1) ||
                      a[1].n.localeCompare(b[1].n))
                    .map(([id, n]) => (
                      <option key={id} value={id}>{n.n}{n.f ? "" : " (no fuel)"}</option>
                    ))}
                </optgroup>
              ))}
            </select>

            <div className="mt-4">
              <span className="jp-eyebrow">Saved trips</span>
              {!storageOk && <p className="jp-note mt-1">Saving isn&rsquo;t available in this browser.</p>}
              {storageOk && (
                <>
                  <div className="jp-pickgrid mt-2">
                    <input type="text" className="jp-field" placeholder="Name this trip…" value={tripName}
                           onChange={(e) => setTripName(e.target.value)} aria-label="Trip name" />
                    <button type="button" className="jp-preset" onClick={saveTrip}>Save current trip</button>
                  </div>
                  {savedTrips.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {savedTrips.map((t) => (
                        <span className="jp-wp" key={t.key}>
                          <button type="button" style={{ background: "none", padding: 0, fontWeight: 600, color: "#fff" }}
                                  onClick={() => loadTrip(t.key)}>{t.name}</button>
                          <button type="button" aria-label={"Delete " + t.name} onClick={() => deleteTrip(t.key)}>
                            <X size={13} aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold mb-1" htmlFor="price">
                {fuelLabel} price in the city ($/L)
              </label>
              <input id="price" type="number" min="0" step="0.01" className="jp-field jp-mono"
                     value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} />
              <p className="jp-note mt-1">
                Outback stops charge more — typical roadhouse premiums are built in. Live price feeds come later.
              </p>
            </div>
          </div>

          <TripIdeas onLoad={loadSuggested} />

          <div className="jp-card p-5 jp-sec-trip">
            <div className="flex items-center gap-2 mb-3">
              <Fuel size={18} style={{ color: "var(--sign)" }} aria-hidden />
              <span className="jp-eyebrow">Trip budget</span>
            </div>
            <div className="jp-pickgrid">
              <div>
                <label className="block text-sm font-semibold mb-1" htmlFor="bn">Nights away</label>
                <input id="bn" type="number" min="1" step="1" className="jp-field jp-mono"
                       value={nights === "" ? plan.days : nights}
                       onChange={(e) => setNights(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" htmlFor="bs">Where you&rsquo;ll stay</label>
                <select id="bs" className="jp-field" value={stayStyle}
                        onChange={(e) => { setStayStyle(e.target.value); setNightly(""); }}>
                  {Object.entries(STAY_RATES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" htmlFor="bnr">Per night ($)</label>
                <input id="bnr" type="number" min="0" step="1" className="jp-field jp-mono"
                       value={nightly === "" ? STAY_RATES[stayStyle].rate : nightly}
                       onChange={(e) => setNightly(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" htmlFor="bf">Food &amp; extras / day ($)</label>
                <input id="bf" type="number" min="0" step="5" className="jp-field jp-mono" value={foodPerDay}
                       onChange={(e) => setFoodPerDay(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="jp-chip">Fuel ${fmt(plan.cost)}</span>
              <span className="jp-chip">Stays ${fmt(budget.stays)}</span>
              <span className="jp-chip">Food ${fmt(budget.food)}</span>
              <span className="jp-chip"><strong>Whole trip ≈ ${fmt(budget.total)}</strong></span>
            </div>
            <p className="jp-note mt-2">
              Nights default to your driving days plus any lay nights — tap a stop on the leg sheet
              to add nights there.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          {sharedIn && (
            <div className="jp-card p-5 jp-sec-trip jp-sharedbanner">
              <div className="flex items-start justify-between gap-2">
                <p className="jp-note" style={{ fontSize: "0.9rem" }}>
                  📬 <strong>Someone sent you this trip:</strong> {NODES[sharedIn.a].n}
                  {sharedIn.a === sharedIn.b ? " loop" : " → " + NODES[sharedIn.b].n} · {sharedIn.n} waypoints.
                  Every cost below is calculated for <strong>your</strong> rig — set yours on the
                  {" "}<strong>Rig</strong> page and watch the numbers change.
                </p>
                <button type="button" className="jp-preset" aria-label="Dismiss"
                        onClick={() => setSharedIn(null)}>✕</button>
              </div>
            </div>
          )}

          {travelCard}
          {!travel && (
            <div className="jp-card p-5 jp-mobileonly">
              <span className="jp-eyebrow">🚐 Travel Mode</span>
              <p className="jp-note mt-2">
                This page becomes your on-road companion — next stop, next fill-up, live prices,
                the fill-up logger and road reports. Build a trip on the <strong>Plan</strong> page,
                then press <strong>Start this trip</strong> on the <strong>Trip</strong> page and
                Travel Mode lives here.
              </p>
            </div>
          )}

          {story && (
            <div className="jp-modal" role="dialog" aria-modal="true" aria-label="Your trip card"
                 onClick={(e) => { if (e.target === e.currentTarget) setStory(null); }}>
              <div className="jp-modalcard jp-card p-4">
                <img className="jp-modalimg" src={story} alt="JourneyPro trip card ready to share" />
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button type="button" className="jp-load" onClick={shareStory}>Share…</button>
                  <a className="jp-preset" href={story}
                     download={"journeypro-" + startId + "-" + endId + ".png"}>Download</a>
                  <button type="button" className="jp-preset" onClick={() => setStory(null)}>Close</button>
                </div>
                <p className="jp-note mt-2">Post it to the group — every card carries the map.</p>
              </div>
            </div>
          )}

          {photoView && (
            <div className="jp-modal" role="dialog" aria-modal="true" aria-label="Journal photo"
                 onClick={(e) => { if (e.target === e.currentTarget) setPhotoView(null); }}>
              <div className="jp-modalcard jp-card p-3">
                <img className="jp-modalimg" src={photoView} alt="Journal photo" />
                <div className="flex gap-2 mt-3">
                  <button type="button" className="jp-preset" onClick={() => setPhotoView(null)}>Close</button>
                </div>
              </div>
            </div>
          )}

          <div className="jp-sign p-6 md:p-8 jp-sec-trip">
            <p className="jp-display uppercase tracking-widest text-sm font-semibold"
               style={{ color: "rgba(255,255,255,0.75)" }}>
              Trip sheet{waypoints.length > 0 ? " · " + NODES[startId].n + " → " + NODES[endId].n : ""}
            </p>

            {route.segs.length === 0 ? (
              <p className="mt-4 text-lg" style={{ color: "rgba(255,255,255,0.9)" }}>
                Add at least one destination to build your trip sheet.
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="jp-display font-bold" style={{ fontSize: "clamp(3rem, 9vw, 4.8rem)", lineHeight: 1 }}>
                    ${fmt(plan.fuelTotal)}
                  </span>
                  <span className="jp-display text-xl font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                    in {fuelLabel.toLowerCase()}
                  </span>
                </div>

                <div className="jp-sign-rule mt-5 pt-4 jp-statgrid">
                  {[
                    { k: "Distance", v: fmt(plan.km) + " km" },
                    { k: "Fuel used", v: fmt(plan.litres + plan.localLitres) + " L" },
                    { k: "Fill-ups", v: plan.fillCount === 0 ? "None" : String(plan.fillCount) },
                    { k: "Driving days", v: "~" + plan.days },
                  ].map((row) => (
                    <div key={row.k}>
                      <p className="jp-display uppercase text-xs tracking-widest font-semibold"
                         style={{ color: "rgba(255,255,255,0.7)" }}>{row.k}</p>
                      <p className="jp-mono text-2xl font-semibold mt-0.5">{row.v}</p>
                    </div>
                  ))}
                </div>

                {(towing || plan.premium > 0.5 || plan.localCost > 0.5) && (
                  <div className="jp-sign-rule mt-5 pt-4">
                    {towing && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <span className="jp-mono text-xs w-20 flex-none" style={{ color: "rgba(255,255,255,0.8)" }}>Unhitched</span>
                          <div className="jp-bar flex-1">
                            <span style={{ width: (plan.cost > 0 ? (plan.soloCost / plan.cost) * 100 : 0) + "%",
                                           background: "rgba(255,255,255,0.85)" }} />
                          </div>
                          <span className="jp-mono text-xs w-16 text-right flex-none">${fmt(plan.soloCost)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="jp-mono text-xs w-20 flex-none" style={{ color: "rgba(255,255,255,0.8)" }}>Hitched</span>
                          <div className="jp-bar flex-1"><span style={{ width: "100%", background: "var(--amber)" }} /></div>
                          <span className="jp-mono text-xs w-16 text-right flex-none">${fmt(plan.cost)}</span>
                        </div>
                      </div>
                    )}
                    <div className={towing ? "mt-3 flex flex-col gap-1" : "flex flex-col gap-1"}>
                      {towing && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="jp-display uppercase text-xs tracking-widest font-semibold"
                                style={{ color: "rgba(255,255,255,0.7)" }}>Towing adds</span>
                          <span className="jp-mono text-base font-semibold" style={{ color: "var(--amber)" }}>
                            +${fmt(plan.added)} · +{fmt(plan.addedPct)}%
                          </span>
                        </div>
                      )}
                      {plan.premium > 0.5 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="jp-display uppercase text-xs tracking-widest font-semibold"
                                style={{ color: "rgba(255,255,255,0.7)" }}>Outback premium</span>
                          <span className="jp-mono text-base font-semibold" style={{ color: "var(--amber)" }}>
                            +${fmt(plan.premium)} · +{fmt(plan.premiumPct)}%
                          </span>
                        </div>
                      )}
                      {plan.localCost > 0.5 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="jp-display uppercase text-xs tracking-widest font-semibold"
                                style={{ color: "rgba(255,255,255,0.7)" }}>Local running around</span>
                          <span className="jp-mono text-base font-semibold" style={{ color: "var(--amber)" }}>
                            +${fmt(plan.localCost)} · {plan.stayNightsTotal} lay {plan.stayNightsTotal === 1 ? "night" : "nights"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="jp-sign-rule mt-5 pt-4 flex items-center justify-between gap-3">
                  <span className="jp-display uppercase text-xs tracking-widest font-semibold"
                        style={{ color: "rgba(255,255,255,0.7)" }}>Whole trip ≈</span>
                  <span className="jp-display font-bold text-2xl">${fmt(budget.total)}</span>
                </div>
              </>
            )}
            {route.segs.length > 0 && !travel && (
              <button type="button" className="jp-startbtn" onClick={startTravel}>
                🚐 Start this trip — Travel Mode
              </button>
            )}
            {route.segs.length > 0 && (
              <button type="button" className="jp-sharebtn" onClick={makeStory} disabled={storyBusy}>
                {storyBusy ? "Building your card…" : "📸 Share this trip"}
              </button>
            )}
            {route.segs.length > 0 && (
              <button type="button" className="jp-sharebtn" onClick={shareTripLink}>
                {linkCopied ? "✓ Link copied — paste it anywhere" : "🔗 Send this trip to someone"}
              </button>
            )}
          </div>

          <RouteMap route={route} waypoints={waypoints} fills={plan.fills}
                    dayAt={plan.dayAt} stays={stays} marks={tripMarks}
                    visited={visited} onToggleVisited={toggleVisited} />

          {route.segs.length > 0 && (
            <div className="jp-card p-5 jp-sec-trip">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="jp-eyebrow">Leg sheet &amp; fill plan</span>
                <span className="jp-chip">~{fmt(plan.avgCons, 1)} L/100km as configured</span>
              </div>
              <p className="jp-note mb-2">Tap any stop for hours, facilities, things to do &amp; places to stay.</p>
              {route.segs.some((s) => s.t === "y") && (
                <p className="jp-note mb-2" style={{ color: "var(--sign)", fontWeight: 600 }}>
                  ⛴️ Includes the Spirit of Tasmania (Geelong ⇄ Devonport). Fares for a car + van
                  aren&rsquo;t in the totals — budget roughly $400–$1,000+ each way depending on season
                  and rig length, and book well ahead for summer.
                </p>
              )}
              {route.segs.some((s) => s.t === "u") && (
                <p className="jp-note mb-2" style={{ color: "var(--red)", fontWeight: 600 }}>
                  ⚠️ This route includes unsealed Outback Way legs — genuine dirt-road touring.
                  Off-road van, extra water and spare fuel strongly advised; check road conditions
                  after rain, and arrange the free WA &amp; NT transit permits for the Great Central
                  Road online before you go. Fuel figures already allow extra burn on dirt.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button type="button" className="jp-preset" onClick={fetchWeather}
                        disabled={wx.status === "loading"}>
                  <span className="inline-flex items-center gap-1">
                    {wx.status === "loading"
                      ? <Loader2 size={14} aria-hidden className="animate-spin" />
                      : <CloudSun size={14} aria-hidden />}
                    {wx.status === "done" ? "Refresh live weather" : "Fetch live weather"}
                  </span>
                </button>
                {wx.status === "done" && (
                  <span className="jp-note">Today&rsquo;s forecast at each stop — arrival-day forecasts come later.</span>
                )}
                {wx.status === "sample" && (
                  <span className="jp-note" style={{ color: "var(--red)" }}>
                    Preview blocks live calls — showing clearly-labelled <strong>sample</strong> weather
                    (marked *). Real forecasts switch on with the real website.
                  </span>
                )}
              </div>

              {route.stops.map((id, i) => {
                const node = NODES[id];
                const fill = plan.fills[id];
                const tightNeed = plan.tight[id];
                const isMajor = waypoints.includes(id);
                const open = openIdx === i;
                return (
                  <div key={id + "-" + i} id={"jp-stop-" + i}>
                    {(i === 0 || plan.dayAt[i] !== plan.dayAt[i - 1]) && (
                      <p className="jp-display mt-1" style={{ color: "var(--sign)", fontWeight: 700,
                         letterSpacing: "0.12em", fontSize: "0.75rem", textTransform: "uppercase" }}>
                        Day {plan.dayAt[i]}
                      </p>
                    )}
                    <button type="button" className="jp-stopbtn" aria-expanded={open}
                            onClick={() => setOpenIdx(open ? null : i)}>
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className="jp-dot" data-major={isMajor} aria-hidden />
                        <span className={isMajor ? "truncate font-bold" : "truncate font-medium"}>{node.n}</span>
                        {node.k === "rh" && <span className="jp-tag">Roadhouse</span>}
                        {!node.f && <span className="jp-tag" style={{ color: "var(--red)", borderColor: "var(--red)" }}>No fuel</span>}
                        {tripMarks && tripMarks.start === id && i === route.stops.indexOf(tripMarks.start) && (
                          <span className="jp-tag" style={{ color: "#fff", background: "var(--red)", borderColor: "var(--red)" }}>Route start</span>
                        )}
                        {tripMarks && tripMarks.end === id && tripMarks.end !== tripMarks.start && i === route.stops.lastIndexOf(tripMarks.end) && (
                          <span className="jp-tag" style={{ color: "var(--red)", borderColor: "var(--red)" }}>Route end</span>
                        )}
                        {journal[id] && journal[id].rating ? (
                          <span className="jp-tag" style={{ background: "var(--amber)", borderColor: "var(--ink)",
                                color: "var(--ink)", fontWeight: 700 }}>★ {journal[id].rating}</span>
                        ) : journal[id] ? (
                          <span className="jp-tag">📝</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2 flex-none">
                        {(stays[id] || 0) > 0 && (
                          <span className="jp-chip jp-mono">🌙 {stays[id]}</span>
                        )}
                        {wx.byId[id] && (
                          <span className="jp-chip jp-mono">{wxInfo(wx.byId[id].code).e} {Math.round(wx.byId[id].tmax)}°{wx.status === "sample" ? "*" : ""}</span>
                        )}
                        {fill && (
                          <span className="jp-fill jp-mono">
                            FILL {fmt(fill.litres)} L · ${fmt(fill.cost)} @ ${fill.price.toFixed(2)}
                          </span>
                        )}
                        <ChevronDown size={16} aria-hidden
                          style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms" }} />
                      </span>
                    </button>

                    {open && (
                      <div className="jp-guide">
                        <p className="flex items-center gap-2">
                          <Clock size={14} aria-hidden style={{ color: "var(--muted)", flex: "none" }} />
                          <span><strong>Typical hours:</strong> {node.hrs}</span>
                        </p>
                        <p className="flex flex-wrap gap-1.5">
                          {node.fac.map((f) => <span key={f} className="jp-chip">{f}</span>)}
                        </p>
                        {wx.byId[id] && (
                          <p className="flex items-center gap-2">
                            <Wind size={14} aria-hidden style={{ color: "var(--muted)", flex: "none" }} />
                            <span>
                              <strong>{wx.status === "sample" ? "Sample" : "Today"}:</strong> {wxInfo(wx.byId[id].code).t}, {Math.round(wx.byId[id].tmin)}–{Math.round(wx.byId[id].tmax)}°C,
                              {" "}rain {Math.round(wx.byId[id].rain)}%, wind to {Math.round(wx.byId[id].wind)} km/h
                              {wx.byId[id].wind >= 40 ? " — strong wind, take care towing" : ""}
                            </span>
                          </p>
                        )}
                        <p><strong>See &amp; do:</strong> {node.see}</p>
                        {livePrices[id] && livePrices[id].n > 0 && (
                          <p className="jp-livefuel">
                            ⛽ <strong>Live {FUEL_META[vehicle.fuel].label.toLowerCase()}:</strong>
                            {" "}from ${(livePrices[id].min / 100).toFixed(2)} · avg ${(livePrices[id].avg / 100).toFixed(2)}
                            {" "}<span className="jp-repmeta">({livePrices[id].n} station{livePrices[id].n === 1 ? "" : "s"} today · {livePrices[id].src})</span>
                          </p>
                        )}
                        <p><strong>Stay:</strong> {node.stay}{" "}
                          <a href={"https://www.google.com/search?q=" + encodeURIComponent(node.stay + " " + node.n + " " + node.st)}
                             target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                            find this park <ExternalLink size={12} aria-hidden />
                          </a>
                        </p>
                        <p className="flex flex-wrap items-center gap-2">
                          <span><strong>Nights here:</strong></span>
                          <input type="number" min="0" max="30" step="1" className="jp-field jp-mono"
                                 style={{ width: "5.5rem", padding: "0.3rem 0.5rem" }}
                                 value={stays[id] || 0} aria-label={"Nights at " + node.n}
                                 onChange={(e) => setStays({ ...stays, [id]: Math.max(0, Number(e.target.value) || 0) })} />
                          <span className="jp-note">adds nights to the budget + ~40 km/day local driving</span>
                        </p>
                        <p>
                          <a href={mapUrl(id)} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1">
                            Map, photos &amp; reviews <ExternalLink size={13} aria-hidden />
                          </a>
                        </p>
                        <p className="mt-2">
                          <button type="button" className="jp-preset" data-on={!!visited[id]}
                                  onClick={() => toggleVisited(id)}>
                            {visited[id] ? "✓ Been here " + String(visited[id]).slice(0, 4) : "Mark as visited"}
                          </button>
                        </p>
                        <div className="jp-journal mt-2">
                          <p className="jp-eyebrow mb-1" style={{ fontSize: "0.68rem" }}>My journal</p>
                          <div className="flex items-center gap-1 mb-2" role="group"
                               aria-label={"Your rating for " + node.n}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button key={s} type="button" className="jp-star"
                                      aria-label={s + (s === 1 ? " star" : " stars")}
                                      aria-pressed={((journal[id] && journal[id].rating) || 0) >= s}
                                      onClick={() => setRating(id, s)}>
                                {((journal[id] && journal[id].rating) || 0) >= s ? "★" : "☆"}
                              </button>
                            ))}
                            {journal[id] && journal[id].rating ? (
                              <button type="button" className="jp-preset" style={{ marginLeft: "0.4rem" }}
                                      onClick={() => setRating(id, 0)}>clear</button>
                            ) : null}
                          </div>
                          <textarea className="jp-field jp-notearea" rows={3}
                                    placeholder={"Your notes on " + node.n + " — the good sites, the tips, the truth…"}
                                    value={draftNote}
                                    onChange={(e) => setDraftNote(e.target.value)}
                                    onBlur={() => saveNote(id)} />
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {((journal[id] && journal[id].photos) || []).map((p, pi) => (
                              <span key={pi} className="jp-thumbwrap">
                                <button type="button" className="jp-thumb" onClick={() => setPhotoView(p)}
                                        aria-label={"View photo " + (pi + 1) + " of " + node.n}>
                                  <img src={p} alt="" />
                                </button>
                                <button type="button" className="jp-thumbx" aria-label="Remove photo"
                                        onClick={() => removePhoto(id, pi)}>×</button>
                              </span>
                            ))}
                            {((journal[id] && journal[id].photos) || []).length < 3 && (
                              <label className="jp-preset" style={{ cursor: "pointer" }}>
                                📷 Add photo
                                <input type="file" accept="image/*" multiple hidden
                                       onChange={(e) => addPhotos(id, e.target.files, e.target)} />
                              </label>
                            )}
                          </div>
                          {(journal[id] && (journal[id].rating || journal[id].note)) ? (
                            <p className="mt-2">
                              {journal[id].sharedAt ? (
                                <span className="jp-chip">✓ Shared with travellers</span>
                              ) : (
                                <button type="button" className="jp-preset" onClick={() => shareEntry(id)}>
                                  📣 Share this with other travellers
                                </button>
                              )}
                            </p>
                          ) : null}
                          <p className="jp-note mt-1">Photos are shrunk to travel size and stay on this phone.</p>
                          {journalWarn && (
                            <p className="jp-note mt-1" style={{ color: "var(--red)", fontWeight: 600 }}>
                              Photo storage is full — remove a photo or two and it&rsquo;ll save again.
                            </p>
                          )}
                        </div>
                        <div className="jp-community mt-2">
                          <p className="jp-eyebrow mb-1" style={{ fontSize: "0.68rem" }}>Travellers say</p>
                          {(() => {
                            const c = community[id];
                            const freshReports = ((c && c.reports) || []).filter((r) => r.d && isFresh(r.d, 14));
                            const notes = ((c && c.reviews) || []).slice(0, 5);
                            return (
                              <>
                                {freshReports.length > 0 && (
                                  <div className="mb-2">
                                    {freshReports.slice(0, 4).map((r, ri) => (
                                      <p key={ri} className="jp-report">
                                        <strong>{REPORT_LABEL[r.k] || "Report"}</strong>
                                        {r.t ? <> — {r.t}</> : null}
                                        <span className="jp-repmeta"> · {r.h || "Traveller"} · {daysAgo(r.d)}</span>
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {c && c.loading ? (
                                  <p className="jp-note">Checking the bush telegraph…</p>
                                ) : communityDown && notes.length === 0 && freshReports.length === 0 ? (
                                  <p className="jp-note">Traveller notes and road reports will appear here once the
                                    community service is switched on.</p>
                                ) : notes.length === 0 && freshReports.length === 0 ? (
                                  <p className="jp-note">No traveller notes here yet — yours could be the first.</p>
                                ) : (
                                  notes.map((n, ni) => (
                                    <p key={ni} className="jp-travnote">
                                      <strong>{n.h || "Traveller"}</strong>
                                      {n.r ? <span style={{ color: "var(--amber)" }}> {"★".repeat(Math.min(5, n.r))}</span> : null}
                                      {n.t ? <> — {n.t}</> : null}
                                      <span className="jp-repmeta"> · {n.d ? daysAgo(n.d) : ""}</span>
                                    </p>
                                  ))
                                )}
                                <div className="mt-2">
                                  <p className="jp-note mb-1">Spotted something on the road in or out?</p>
                                  <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Report kind">
                                    {REPORT_KINDS.map(([k, lbl]) => (
                                      <button key={k} type="button" className="jp-preset" data-on={repKind === k}
                                              onClick={() => setRepKind(repKind === k ? null : k)}>
                                        {lbl}
                                      </button>
                                    ))}
                                  </div>
                                  {repKind && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <input type="text" className="jp-field" maxLength={120}
                                             style={{ flex: "1 1 12rem" }}
                                             placeholder="Optional detail — e.g. 'just past the roadhouse'"
                                             value={repText}
                                             onChange={(e) => setRepText(e.target.value)} />
                                      <button type="button" className="jp-load" disabled={repBusy}
                                              onClick={() => sendReport(id)}>
                                        {repBusy ? "Sending…" : "Send report"}
                                      </button>
                                    </div>
                                  )}
                                  <p className="jp-note mt-1">
                                    Posting as <strong>{handle || "a new road name"}</strong>
                                    {" "}·{" "}
                                    <input type="text" className="jp-field jp-handle" maxLength={20}
                                           aria-label="Your road name"
                                           placeholder="pick a road name"
                                           value={handle}
                                           onChange={(e) => setHandle(e.target.value.replace(/[<>]/g, ""))}
                                           onBlur={() => {
                                             if (typeof window !== "undefined" && window.storage) {
                                               try { window.storage.set("handle:v1", handle || ensureHandle()); } catch (e) { /* fine */ }
                                             }
                                           }} />
                                  </p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {tightNeed !== undefined && (
                      <p className="jp-seg" style={{ color: "var(--red)" }}>
                        <AlertTriangle size={13} aria-hidden style={{ flex: "none" }} />
                        Long gap ahead needs ~{tightNeed} L — more than a safe tank for this rig. Carry extra fuel.
                      </p>
                    )}
                    {i < route.segs.length && (
                      route.segs[i].t === "y" ? (
                        <p className="jp-seg">⛴️ Spirit of Tasmania — overnight crossing, ~9–11 hr, no fuel burned</p>
                      ) : (
                        <p className="jp-seg jp-mono">
                          {route.segs[i].km} km
                          {route.segs[i].t === "u" && (
                            <span style={{ color: "var(--red)", fontWeight: 700 }}> · unsealed</span>
                          )}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="jp-card p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="jp-diamond mt-1" aria-hidden />
              <p className="text-sm">
                <strong>Leave with a full tank.</strong> The fill plan tops you up wherever the next
                stretch would take you under a 20% reserve — cheapest safe strategy, not every stop.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="jp-diamond mt-1" aria-hidden />
              <p className="text-sm">
                <strong>Hours &amp; facilities are typical, not live.</strong> Remote roadhouses change
                hours with seasons and staffing — always confirm before relying on one after dark.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Info size={16} className="mt-0.5 flex-none" style={{ color: "var(--muted)" }} aria-hidden />
              <p className="jp-note">
                Estimates for planning only. Vehicle, van and trailer figures are curated
                approximations — check your own plates and handbook. Live fuel prices arrive in a
                coming update.
              </p>
            </div>
          </div>

          <p className="jp-note flex items-center gap-2 px-1">
            <Fuel size={14} aria-hidden />
            Dataset: {VEHICLE_DATA.length} vehicle makes ({VEHICLE_VARIANT_COUNT} rigs), {VAN_DATA.length} caravan &amp; camper brands, 8 trailer sizes,
            {" "}{Object.keys(NODES).length} stop guides. Live weather by Open-Meteo · map &copy; OpenStreetMap. Missing yours? Tell us and it goes in.
          </p>

          <div className="jp-card p-5 jp-sec-mymap">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="jp-eyebrow">🗺️ My Australia</span>
              <span className="jp-chip jp-mono">
                {Object.keys(visited).filter((id) => NODES[id]).length} / {Object.keys(NODES).length}
              </span>
            </div>
            <ScratchSketch visited={visited} />
            {(() => {
              const visIds = Object.keys(visited).filter((id) => NODES[id]);
              const visSet = new Set(visIds);
              const pctV = Math.round((visIds.length / Object.keys(NODES).length) * 100);
              const stN = new Set(visIds.map((id) => NODES[id].st)).size;
              const jIds = Object.keys(journal).filter((id) => NODES[id]);
              const jx = {
                entries: jIds.length,
                notes: jIds.filter((id) => journal[id].note).length,
                photos: jIds.reduce((a, id) => a + ((journal[id].photos || []).length), 0),
              };
              const earned = BADGES.filter((b) => b.test(visSet, jx));
              const locked = BADGES.filter((b) => !b.test(visSet, jx));
              return (
                <>
                  <div className="jp-tprog mt-3 mb-1" role="progressbar" aria-valuenow={pctV}
                       aria-valuemin={0} aria-valuemax={100} aria-label="Share of the network visited">
                    <div className="jp-tprogfill" style={{ width: pctV + "%" }} />
                  </div>
                  <p className="jp-note mb-2">
                    {visIds.length} of {Object.keys(NODES).length} stops · {stN} of {STATE_GROUPS.length} states
                    &amp; territories · {pctV}% of the map
                    {jx.entries > 0 && <> · {jx.entries} journalled · {jx.photos} {jx.photos === 1 ? "photo" : "photos"}</>}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {earned.map((b) => (
                      <span key={b.id} className="jp-chip"
                            style={{ background: "var(--amber)", borderColor: "var(--ink)", fontWeight: 700 }}
                            title={b.hint}>
                        {b.emoji} {b.name}
                      </span>
                    ))}
                    {locked.map((b) => (
                      <span key={b.id} className="jp-chip" style={{ opacity: 0.5 }} title={b.hint}>
                        🔒 {b.name}
                      </span>
                    ))}
                  </div>
                  <p className="jp-note">
                    Stops tick themselves off in Travel Mode — or mark any stop from its map pin
                    or stop guide. Highways turn green once you&rsquo;ve done both ends.
                  </p>
                </>
              );
            })()}
          </div>

        </section>
        <nav className="jp-tabbar" aria-label="App sections">
          {[
            ["rig", "🚙", "Rig"],
            ["plan", "🗺️", "Plan"],
            ["trip", "🧾", "Trip"],
            ["travel", "🚐", "Travel"],
            ["mymap", "🏆", "My Map"],
          ].map(([id, icon, label]) => (
            <button key={id} type="button" className="jp-tabbtn" data-on={tab === id}
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => { setTab(id); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); }}>
              <span className="jp-tabicon" aria-hidden>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}
