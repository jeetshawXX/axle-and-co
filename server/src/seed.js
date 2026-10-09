import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

// NOTE: the catalogue is fictional demo data (invented brands and part numbers).

export const DEMO_ADMIN = { email: 'admin@axleandco.test', password: 'Admin@123' };
export const DEMO_CUSTOMER = { email: 'demo@axleandco.test', password: 'Demo@1234' };

const CATEGORIES = [
  ['brakes', 'Brakes', 'Pads, discs and everything that stops the car.'],
  ['batteries', 'Batteries', 'Maintenance-free starter batteries and jump starters.'],
  ['tires-wheels', 'Tires & Wheels', 'Tubeless radials matched to your size.'],
  ['engine', 'Engine Parts', 'Spark plugs, belts and service parts.'],
  ['filters-fluids', 'Filters & Fluids', 'Oil, air, cabin and fuel filters, plus lubricants and coolants.'],
  ['lighting', 'Lights', 'Halogen and LED headlamp bulbs, fog lamps and interior lighting.'],
  ['electronics', 'Electronics', 'Dash cams, scanners, chargers and parking sensors.'],
  ['tools', 'Tools', 'Garage tools, jacks and roadside essentials.'],
  ['wipers-care', 'Wipers & Care', 'Wiper blades and cleaning supplies.']
];

const SUPPLIERS = [
  ['Bharat Auto Distributors', 2, 0, 'orders@bharatauto.test'],
  ['Pinnacle Parts Co.', 4, 1, 'dropship@pinnacleparts.test'],
  ['Metro Tyre & Battery Wholesale', 3, 0, 'sales@metrotb.test']
];

// tier: 1 small hatch, 2 mid sedan / compact SUV, 3 large SUV
const VEHICLES = [
  { make: 'Maruti Suzuki', model: 'Swift', code: 'SWF', from: 2012, to: 2024, tier: 1, fuel: ['petrol'], bulb: 'H4', ah: 35, tire: '185/65 R15' },
  { make: 'Maruti Suzuki', model: 'Baleno', code: 'BLN', from: 2015, to: 2024, tier: 1, fuel: ['petrol'], bulb: 'H4', ah: 35, tire: '195/55 R16' },
  { make: 'Maruti Suzuki', model: 'Dzire', code: 'DZR', from: 2012, to: 2024, tier: 1, fuel: ['petrol', 'diesel'], bulb: 'H4', ah: 45, tire: '185/65 R15' },
  { make: 'Hyundai', model: 'i20', code: 'I20', from: 2014, to: 2024, tier: 1, fuel: ['petrol', 'diesel'], bulb: 'H4', ah: 45, tire: '195/55 R16' },
  { make: 'Hyundai', model: 'Creta', code: 'CRT', from: 2015, to: 2024, tier: 2, fuel: ['petrol', 'diesel'], bulb: 'H7', ah: 55, tire: '215/60 R17' },
  { make: 'Tata', model: 'Nexon', code: 'NXN', from: 2017, to: 2024, tier: 2, fuel: ['petrol', 'diesel'], bulb: 'H7', ah: 55, tire: '215/60 R16' },
  { make: 'Tata', model: 'Harrier', code: 'HRR', from: 2019, to: 2024, tier: 3, fuel: ['diesel'], bulb: 'H11', ah: 65, tire: '235/65 R17' },
  { make: 'Mahindra', model: 'Scorpio', code: 'SCO', from: 2014, to: 2024, tier: 3, fuel: ['diesel'], bulb: 'H4', ah: 65, tire: '235/65 R17' },
  { make: 'Mahindra', model: 'XUV700', code: 'X7', from: 2021, to: 2024, tier: 3, fuel: ['petrol', 'diesel'], bulb: 'H11', ah: 65, tire: '255/60 R18' },
  { make: 'Honda', model: 'City', code: 'CTY', from: 2014, to: 2024, tier: 2, fuel: ['petrol'], bulb: 'H11', ah: 45, tire: '185/55 R16' },
  { make: 'Toyota', model: 'Innova Crysta', code: 'INV', from: 2016, to: 2024, tier: 3, fuel: ['diesel'], bulb: 'H11', ah: 65, tire: '215/65 R16' },
  { make: 'Toyota', model: 'Fortuner', code: 'FRT', from: 2016, to: 2024, tier: 3, fuel: ['diesel'], bulb: 'H11', ah: 80, tire: '265/65 R17' },
  { make: 'Kia', model: 'Seltos', code: 'SLT', from: 2019, to: 2024, tier: 2, fuel: ['petrol', 'diesel'], bulb: 'H7', ah: 55, tire: '215/60 R17' }
];

// Small deterministic PRNG so every install gets the same catalogue.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rupees = (n) => Math.round(n * 100);

export function buildCatalogue() {
  const rand = rng(20260710);
  const items = [];
  const add = (p) => items.push({ universal: false, fitment: [], weightKg: 1, ...p });
  const fit = (v, from = v.from, to = v.to) => ({ make: v.make, model: v.model, yearFrom: from, yearTo: to });
  const label = (v) => `${v.make} ${v.model}`;

  for (const v of VEHICLES) {
    const span = v.to - v.from;
    const mid = v.from + Math.floor(span / 2);
    const gens = span >= 10 ? [[v.from, mid], [mid + 1, v.to]] : [[v.from, v.to]];
    const padBase = [1250, 1950, 2850][v.tier - 1];

    // Brake pads: premium (per generation) and an economy alternate
    gens.forEach(([a, b], gi) => {
      add({
        sku: `BRK-${v.code}-F${gi + 1}`, partNumber: `SR-${v.code}${gi + 1}F`, name: `Stoprite Ceramic Front Brake Pads, ${label(v)} (${a}-${b})`,
        brand: 'Stoprite', cat: 'brakes', supplier: 1, price: padBase + Math.round(rand() * 250), fitment: [fit(v, a, b)], weightKg: 1.4,
        description: `Low-dust ceramic front brake pad set made for the ${label(v)} (${a}-${b}). Quiet under light braking, with a wear indicator that tells you before the pads run out.`,
        specs: { Position: 'Front axle', Material: 'Ceramic', 'Wear indicator': 'Yes', Includes: 'Pads, shims and clips', Warranty: '12 months' },
        alt: `BRK-${v.code}-ECO`
      });
    });
    add({
      sku: `BRK-${v.code}-ECO`, partNumber: `SR-${v.code}E`, name: `Stoprite Economy Front Brake Pads, ${label(v)}`,
      brand: 'Stoprite', cat: 'brakes', supplier: 1, price: Math.round(padBase * 0.62), fitment: [fit(v)], weightKg: 1.3,
      description: `Semi-metallic front pad set for the ${label(v)}. A budget-friendly replacement for city driving.`,
      specs: { Position: 'Front axle', Material: 'Semi-metallic', 'Wear indicator': 'No', Warranty: '6 months' }
    });

    add({
      sku: `FLT-${v.code}-OIL`, partNumber: `CF-${v.code}-O`, name: `CleanFlow Spin-on Oil Filter, ${label(v)}`, brand: 'CleanFlow', cat: 'filters-fluids',
      supplier: 1, price: 220 + Math.round(rand() * 220), fitment: [fit(v)], weightKg: 0.4,
      description: `Full-flow oil filter with an anti-drain-back valve, specified for the ${label(v)}.`,
      specs: { Type: 'Spin-on', 'Anti-drain valve': 'Yes', 'Service interval': '10,000 km' }
    });
    add({
      sku: `FLT-${v.code}-AIR`, partNumber: `CF-${v.code}-A`, name: `CleanFlow Air Filter, ${label(v)}`, brand: 'CleanFlow', cat: 'filters-fluids',
      supplier: 1, price: 380 + Math.round(rand() * 500), fitment: [fit(v)], weightKg: 0.3,
      description: `Pleated engine air filter that traps fine dust and keeps airflow steady. Direct fit for the ${label(v)}.`,
      specs: { Type: 'Panel (pleated paper)', 'Service interval': '15,000 km' }
    });
    add({
      sku: `FLT-${v.code}-CAB`, partNumber: `CF-${v.code}-C`, name: `CleanFlow Activated-Carbon Cabin Filter, ${label(v)}`, brand: 'CleanFlow', cat: 'filters-fluids',
      supplier: 1, price: 340 + Math.round(rand() * 360), fitment: [fit(v)], weightKg: 0.2,
      description: `Cabin air filter with an activated-carbon layer to cut dust, pollen and traffic smells in the ${label(v)}.`,
      specs: { Type: 'Activated carbon', 'Service interval': '12,000 km' }
    });
    if (v.fuel.includes('petrol')) {
      add({
        sku: `ENG-${v.code}-SPK`, partNumber: `PX-${v.code}-S`, name: `Pistonix Iridium Spark Plugs (set of 4), ${label(v)}`, brand: 'Pistonix', cat: 'engine',
        supplier: 2, price: 1100 + Math.round(rand() * 700), fitment: [fit(v)], weightKg: 0.3,
        description: `Fine-wire iridium plugs for smoother starts and steadier idle in the petrol ${label(v)}.`,
        specs: { Quantity: '4', Electrode: 'Iridium', 'Service interval': '40,000 km', Fuel: 'Petrol' }
      });
    }
    if (v.fuel.includes('diesel')) {
      add({
        sku: `FLT-${v.code}-FUEL`, partNumber: `PX-${v.code}-F`, name: `Pistonix Diesel Fuel Filter, ${label(v)}`, brand: 'Pistonix', cat: 'filters-fluids',
        supplier: 2, price: 650 + Math.round(rand() * 650), fitment: [fit(v)], weightKg: 0.6,
        description: `Water-separating diesel fuel filter for the ${label(v)}. Protects injectors from contaminated fuel.`,
        specs: { Type: 'Cartridge with water separator', 'Service interval': '20,000 km', Fuel: 'Diesel' }
      });
    }
    add({
      sku: `ENG-${v.code}-BLT`, partNumber: `PX-${v.code}-B`, name: `Pistonix Poly-V Drive Belt, ${label(v)}`, brand: 'Pistonix', cat: 'engine',
      supplier: 2, price: 650 + Math.round(rand() * 850), fitment: [fit(v)], weightKg: 0.3,
      description: `EPDM multi-rib accessory belt for the ${label(v)}. Runs the alternator, water pump and A/C compressor.`,
      specs: { Material: 'EPDM rubber', 'Service interval': '60,000 km' }
    });
  }

  // Batteries grouped by capacity
  const ahs = [...new Set(VEHICLES.map((v) => v.ah))];
  const batPrice = { 35: 3900, 45: 4800, 55: 5900, 65: 7400, 80: 9800 };
  for (const ah of ahs) {
    const fits = VEHICLES.filter((v) => v.ah === ah);
    add({
      sku: `BAT-PRO-${ah}`, partNumber: `VC-P${ah}`, name: `VoltCore Pro ${ah}Ah Maintenance-Free Battery`, brand: 'VoltCore', cat: 'batteries', supplier: 3,
      price: batPrice[ah], fitment: fits.map((v) => fit(v)), weightKg: ah / 4.2, alt: `BAT-ECO-${ah}`,
      description: `Calcium-alloy, sealed ${ah}Ah starter battery with strong cold-start power. Fits ${fits.map(label).join(', ')}.`,
      specs: { Capacity: `${ah} Ah`, Voltage: '12 V', Technology: 'Calcium, maintenance-free', Warranty: '48 months' }
    });
    if (ah <= 65) {
      add({
        sku: `BAT-ECO-${ah}`, partNumber: `VC-E${ah}`, name: `VoltCore Eco ${ah}Ah Starter Battery`, brand: 'VoltCore', cat: 'batteries', supplier: 3,
        price: Math.round(batPrice[ah] * 0.78), fitment: fits.map((v) => fit(v)), weightKg: ah / 4.4,
        description: `Value ${ah}Ah starter battery. Same terminal layout and size as the Pro, with a shorter warranty.`,
        specs: { Capacity: `${ah} Ah`, Voltage: '12 V', Technology: 'Low-maintenance', Warranty: '24 months' }
      });
    }
  }

  // Tires grouped by size
  const sizes = [...new Set(VEHICLES.map((v) => v.tire))];
  sizes.forEach((size, i) => {
    const fits = VEHICLES.filter((v) => v.tire === size);
    const width = Number(size.split('/')[0]);
    const base = 3400 + (width - 185) * 70 + Number(size.slice(-2)) * 120;
    add({
      sku: `TYR-TOUR-${size.replace(/\D/g, '')}`, partNumber: `TW-T${size.replace(/\D/g, '')}`, name: `Treadwell Touring Tubeless Radial ${size}`, brand: 'Treadwell',
      cat: 'tires-wheels', supplier: 3, price: base + Math.round(rand() * 300), fitment: fits.map((v) => fit(v)), weightKg: 9 + i,
      alt: `TYR-GRIP-${size.replace(/\D/g, '')}`,
      description: `Quiet, long-wearing all-season radial in ${size}. Fits ${fits.map(label).join(', ')}.`,
      specs: { Size: size, Type: 'Tubeless radial', Season: 'All-season', 'Treadwear warranty': '50,000 km', Price: 'Per tyre' }
    });
    if (i % 2 === 0) {
      add({
        sku: `TYR-GRIP-${size.replace(/\D/g, '')}`, partNumber: `TW-G${size.replace(/\D/g, '')}`, name: `Treadwell Grip Pro Wet-Weather Radial ${size}`, brand: 'Treadwell',
        cat: 'tires-wheels', supplier: 3, price: Math.round((base + 700) * 1.1), fitment: fits.map((v) => fit(v)), weightKg: 9.5 + i,
        description: `Deep-groove tyre built for monsoon braking in ${size}.`,
        specs: { Size: size, Type: 'Tubeless radial', Season: 'Wet-weather', 'Treadwear warranty': '40,000 km', Price: 'Per tyre' }
      });
    }
  });

  // Headlamp bulbs by type
  const bulbTypes = [...new Set(VEHICLES.map((v) => v.bulb))];
  for (const type of bulbTypes) {
    const fits = VEHICLES.filter((v) => v.bulb === type);
    add({
      sku: `LGT-HAL-${type}`, partNumber: `LD-H${type}`, name: `LumaDrive Halogen Headlamp Bulb ${type} (pair, +60% brighter)`, brand: 'LumaDrive', cat: 'lighting',
      supplier: 2, price: 450 + Math.round(rand() * 250), fitment: fits.map((v) => fit(v)), weightKg: 0.2, alt: `LGT-LED-${type}`,
      description: `Plug-in ${type} halogen upgrade pair. Fits ${fits.map(label).join(', ')}.`,
      specs: { Type: type, Technology: 'Halogen', Brightness: '+60%', Quantity: '2' }
    });
    add({
      sku: `LGT-LED-${type}`, partNumber: `LD-L${type}`, name: `LumaDrive LED Headlamp Kit ${type} (6000K)`, brand: 'LumaDrive', cat: 'lighting',
      supplier: 2, price: 2400 + Math.round(rand() * 900), fitment: fits.map((v) => fit(v)), weightKg: 0.5,
      description: `Cool-white LED conversion kit with built-in fan and driver. ${type} base. Fits ${fits.map(label).join(', ')}.`,
      specs: { Type: type, Technology: 'LED', 'Colour temperature': '6000K', Output: '12,000 lm per pair', Warranty: '24 months' }
    });
  }

  // Universal items
  const uni = (sku, name, brand, cat, supplier, price, description, specs, weightKg = 1, extra = {}) =>
    add({ sku, partNumber: sku.replace(/-/g, ''), name, brand, cat, supplier, price, universal: true, description, specs, weightKg, ...extra });

  uni('LGT-FOG-LED', 'LumaDrive LED Fog Lamp Pair, universal', 'LumaDrive', 'lighting', 2, 1850, 'Round 3-inch LED fog lamps with amber and white modes. Includes wiring harness and switch.', { Power: '30 W', Modes: 'White / Amber', Waterproof: 'IP67' });
  uni('LGT-INT-LED', 'LumaDrive Interior LED Light Strip (4 pcs)', 'LumaDrive', 'lighting', 2, 790, 'Under-dash ambient LED strips with a USB power adaptor.', { Colours: 'RGB', Control: 'Remote' }, 0.3);

  uni('ELC-OBD-BT', 'Gearhead Bluetooth OBD-II Scanner', 'Gearhead', 'electronics', 2, 1290, 'Reads and clears fault codes and streams live engine data to your phone. Works with every petrol and diesel car from 2008 onward.', { Protocol: 'OBD-II / EOBD', Connection: 'Bluetooth 5.0', App: 'Android and iOS' }, 0.1);
  uni('ELC-DASH-1080', 'Gearhead 1080p Dash Cam with Night Vision', 'Gearhead', 'electronics', 2, 3490, 'Loop recording, G-sensor lock and a wide 140° lens.', { Resolution: '1080p', 'Field of view': '140°', Storage: 'microSD up to 128 GB (not included)' }, 0.3, { sale: 2990 });
  uni('ELC-DASH-2K', 'Gearhead 2K Dual-Channel Dash Cam (front + rear)', 'Gearhead', 'electronics', 2, 7990, 'Records front and rear with a parking-mode monitor.', { Resolution: '2K front, 1080p rear', 'Parking mode': 'Yes (hardwire kit)' }, 0.5);
  uni('ELC-INFL-DIG', 'Gearhead Digital Tyre Inflator, 12V', 'Gearhead', 'electronics', 2, 1990, 'Set a target pressure and it stops by itself.', { Pressure: 'Up to 150 PSI', Power: '12V socket', Display: 'Digital LCD' }, 0.9);
  uni('ELC-CHG-65', 'Gearhead 65W USB-C Dual Car Charger', 'Gearhead', 'electronics', 2, 990, 'Fast-charges a laptop and a phone together.', { Output: '65 W total', Ports: 'USB-C + USB-A' }, 0.1);
  uni('ELC-PARK-4', 'Gearhead Reverse Parking Sensor Kit (4 sensors)', 'Gearhead', 'electronics', 2, 1650, 'Beeper-based rear parking sensors with a dash display.', { Sensors: '4', Range: '0.3 to 2.5 m' }, 0.4);
  uni('ELC-JUMP-12', 'Gearhead 12V Portable Jump Starter 12000mAh', 'Gearhead', 'electronics', 2, 4290, 'Starts petrol engines up to 6.0L and diesel up to 3.0L. Doubles as a power bank.', { Capacity: '12,000 mAh', 'Peak current': '800 A' }, 0.8, { sale: 3790 });
  uni('ELC-VAC-12', 'Gearhead Cordless Car Vacuum Cleaner', 'Gearhead', 'electronics', 2, 1490, 'Handheld vacuum with a crevice tool and a washable filter.', { Suction: '9 kPa', Runtime: '25 min' }, 0.6);

  uni('TLS-SOCKET-40', 'Wrenchworks 40-Piece Socket Set', 'Wrenchworks', 'tools', 1, 2490, 'Cr-V sockets and ratchet in a blow-moulded case.', { Drive: '1/4" and 3/8"', Material: 'Chrome vanadium', Warranty: 'Lifetime' }, 2.2);
  uni('TLS-TORQ-12', 'Wrenchworks 1/2" Click Torque Wrench (28-210 Nm)', 'Wrenchworks', 'tools', 1, 3190, 'Click-type wrench, calibrated to ±4%. Right size for wheel nuts.', { Range: '28-210 Nm', Drive: '1/2"' }, 1.5);
  uni('TLS-JACK-2T', 'Wrenchworks 2-Tonne Hydraulic Bottle Jack', 'Wrenchworks', 'tools', 1, 1790, 'Compact hydraulic jack with an overload valve.', { Capacity: '2 tonne', 'Lift range': '148-278 mm' }, 3.4);
  uni('TLS-STAND-3T', 'Wrenchworks 3-Tonne Jack Stands (pair)', 'Wrenchworks', 'tools', 1, 2190, 'Ratchet-lock stands. Never work under a car held only by a jack.', { Capacity: '3 tonne per pair', Height: '280-420 mm' }, 5);
  uni('TLS-JUMP-CBL', 'Wrenchworks 500A Jumper Cables, 3 m', 'Wrenchworks', 'tools', 1, 690, 'Copper-clad cables with insulated clamps.', { Rating: '500 A', Length: '3 m' }, 0.9);
  uni('TLS-GAUGE', 'Wrenchworks Tyre Pressure Gauge, Digital', 'Wrenchworks', 'tools', 1, 450, 'Backlit gauge reading in PSI, bar and kPa.', { Range: '0-100 PSI' }, 0.1);
  uni('TLS-DRAIN', 'Wrenchworks 8L Oil Drain Pan with Funnel', 'Wrenchworks', 'tools', 1, 520, 'Spill-resistant pan with a pour spout.', { Capacity: '8 L' }, 0.7);
  uni('TLS-WRENCH-CROSS', 'Wrenchworks Folding Wheel Wrench (17/19/21/23 mm)', 'Wrenchworks', 'tools', 1, 640, 'Folds flat for the boot. Covers most hatchbacks and SUVs.', { Sizes: '17, 19, 21, 23 mm' }, 0.9);

  uni('FLD-OIL-5W30', 'Slickoil Full-Synthetic Engine Oil 5W-30, 3.5 L', 'Slickoil', 'filters-fluids', 1, 2290, 'API SP / ACEA C3 full-synthetic oil for modern petrol engines.', { Grade: '5W-30', Type: 'Full synthetic', Volume: '3.5 L' }, 3.2, { sale: 1990 });
  uni('FLD-OIL-5W40D', 'Slickoil Diesel Engine Oil 5W-40, 4 L', 'Slickoil', 'filters-fluids', 1, 2890, 'Low-ash synthetic oil for turbo-diesels with a DPF.', { Grade: '5W-40', Type: 'Synthetic', Volume: '4 L' }, 3.7);
  uni('FLD-OIL-10W40', 'Slickoil Semi-Synthetic Engine Oil 10W-40, 3.5 L', 'Slickoil', 'filters-fluids', 1, 1490, 'An economical semi-synthetic for older petrol engines.', { Grade: '10W-40', Type: 'Semi-synthetic', Volume: '3.5 L' }, 3.2);
  uni('FLD-COOL-1L', 'Slickoil Pre-Mixed Coolant, 1 L', 'Slickoil', 'filters-fluids', 1, 320, 'Ready-to-use long-life coolant. Does not need to be diluted.', { Volume: '1 L', 'Protects to': '-37 °C' }, 1.1);
  uni('FLD-BRK-DOT4', 'Slickoil DOT 4 Brake Fluid, 500 ml', 'Slickoil', 'filters-fluids', 1, 290, 'High boiling-point fluid for ABS-equipped cars.', { Spec: 'DOT 4', Volume: '500 ml' }, 0.6);

  uni('WPR-FRAMELESS-22', 'Clearview Frameless Wiper Blade 22"', 'Clearview', 'wipers-care', 1, 420, 'Beam-style blade that hugs the curve of the windscreen. Fits most hook-type arms.', { Length: '22 in (550 mm)', Adaptors: '9 included' }, 0.2);
  uni('WPR-FRAMELESS-24', 'Clearview Frameless Wiper Blade 24"', 'Clearview', 'wipers-care', 1, 460, 'Same blade as the 22", in the longer driver-side length.', { Length: '24 in (600 mm)', Adaptors: '9 included' }, 0.2);
  uni('WPR-WASH-SHAMPOO', 'Clearview Foam Car Wash Shampoo, 1 L', 'Clearview', 'wipers-care', 1, 380, 'pH-neutral foam that is safe on wax and ceramic coatings.', { Volume: '1 L' }, 1.1);
  uni('WPR-MICROFIBER', 'Clearview Microfibre Drying Towels (3 pack)', 'Clearview', 'wipers-care', 1, 560, 'Thick, lint-free 400 GSM towels for streak-free drying.', { Size: '40 x 60 cm', Weight: '400 GSM' }, 0.5);
  uni('WPR-GLASS', 'Clearview Glass Cleaner with Rain Repellent, 500 ml', 'Clearview', 'wipers-care', 1, 340, 'Cleans inside glass and leaves water beading off outside.', { Volume: '500 ml' }, 0.6);

  // Stock, sale flags, age and cost
  items.forEach((p, idx) => {
    const r = rand();
    p.stock = r < 0.04 ? 0 : r < 0.12 ? 1 + Math.floor(rand() * 4) : 8 + Math.floor(rand() * 40);
    if (p.sale == null && rand() < 0.13) p.sale = Math.round(p.price * (0.82 + rand() * 0.1));
    p.ageDays = idx % 9 === 0 ? 3 + Math.floor(rand() * 24) : 45 + Math.floor(rand() * 300);
    p.costPct = 0.58 + rand() * 0.14;
  });
  return items;
}

export async function seedDatabase(db, { bcryptRounds = 10 } = {}) {
  const rand = rng(77);
  const catId = new Map();
  const supId = [];

  db.transaction(() => {
    for (const [slug, name, description] of CATEGORIES) {
      catId.set(slug, db.prepare('INSERT INTO categories (slug, name, description, image) VALUES (?, ?, ?, ?)').run(slug, name, description, `/img/${slug}.svg`).lastInsertRowid);
    }
    for (const [name, lead, dropship, email] of SUPPLIERS) {
      supId.push(db.prepare('INSERT INTO suppliers (name, lead_time_days, dropship, contact_email) VALUES (?, ?, ?, ?)').run(name, lead, dropship, email).lastInsertRowid);
    }
    for (const v of VEHICLES) db.prepare('INSERT INTO vehicles (make, model, year_from, year_to) VALUES (?, ?, ?, ?)').run(v.make, v.model, v.from, v.to);

    const catalogue = buildCatalogue();
    const idBySku = new Map();
    const ins = db.prepare(`INSERT INTO products (sku, part_number, name, brand, category_id, supplier_id, description, specs, image, price_cents,
      sale_price_cents, cost_cents, stock, low_stock_threshold, weight_kg, is_universal, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, ?, ?, datetime('now', ?))`);
    for (const p of catalogue) {
      const id = ins.run(p.sku, p.partNumber, p.name, p.brand, catId.get(p.cat), supId[p.supplier - 1], p.description, JSON.stringify(p.specs),
        `/img/${p.cat}.svg`, rupees(p.price), p.sale ? rupees(p.sale) : null, Math.round(rupees(p.price) * p.costPct), p.stock,
        Math.round(p.weightKg * 10) / 10, p.universal ? 1 : 0, `-${p.ageDays} days`).lastInsertRowid;
      idBySku.set(p.sku, id);
      for (const f of p.fitment) db.prepare('INSERT INTO product_fitment (product_id, make, model, year_from, year_to) VALUES (?, ?, ?, ?, ?)').run(id, f.make, f.model, f.yearFrom, f.yearTo);
    }
    const link = db.prepare('INSERT OR IGNORE INTO product_alternates (product_id, alternate_id) VALUES (?, ?)');
    for (const p of catalogue) {
      if (!p.alt || !idBySku.has(p.alt)) continue;
      link.run(idBySku.get(p.sku), idBySku.get(p.alt));
      link.run(idBySku.get(p.alt), idBySku.get(p.sku));
    }
  })();

  const hash = await bcrypt.hash(DEMO_CUSTOMER.password, bcryptRounds);
  const adminHash = await bcrypt.hash(DEMO_ADMIN.password, bcryptRounds);
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  addUser.run('Store Admin', DEMO_ADMIN.email, adminHash, 'admin');
  const customers = [
    ['Demo Customer', DEMO_CUSTOMER.email], ['Aarav Mehta', 'aarav@example.test'], ['Priya Nair', 'priya@example.test'], ['Rohan Das', 'rohan@example.test']
  ].map(([n, e]) => Number(addUser.run(n, e, hash, 'customer').lastInsertRowid));

  const coupon = db.prepare('INSERT INTO coupons (code, percent_off, min_subtotal_cents, expires_at) VALUES (?, ?, ?, ?)');
  coupon.run('WELCOME10', 10, 0, null);
  coupon.run('MONSOON15', 15, rupees(5000), null);

  // Demo history so the dashboard and "customers also bought" are not empty
  const address = (name) => JSON.stringify({ fullName: name, phone: '9876543210', line1: '12 MG Road', line2: '', city: 'Nagpur', state: 'Maharashtra', postalCode: '440001' });
  const products = db.prepare('SELECT id, sku, name, price_cents, sale_price_cents FROM products WHERE stock > 10 ORDER BY id').all();
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'paid', 'cancelled'];
  const insOrder = db.prepare(`INSERT INTO orders (number, user_id, status, payment_status, payment_provider, card_last4, subtotal_cents, discount_cents, shipping_cents,
    tax_cents, total_cents, shipping_method, shipping_address, email, carrier, tracking_number, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'mock', '4242', ?, 0, ?, ?, ?, 'standard', ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`);
  const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, sku, name, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?, ?)');
  const insEvt = db.prepare("INSERT INTO order_events (order_id, status, note, created_at) VALUES (?, ?, ?, datetime('now', ?))");
  db.transaction(() => {
    for (let i = 0; i < 28; i++) {
      const uid = customers[i % customers.length];
      const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(uid);
      const n = 1 + Math.floor(rand() * 3);
      const picked = [...new Set(Array.from({ length: n }, () => products[Math.floor(rand() * products.length)]))];
      const lines = picked.map((p) => ({ p, qty: 1 + Math.floor(rand() * 2), price: p.sale_price_cents ?? p.price_cents }));
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const shipping = subtotal >= rupees(2000) ? 0 : rupees(99);
      const tax = Math.round(subtotal * 0.18);
      const status = i < 8 ? 'delivered' : statuses[Math.floor(rand() * statuses.length)];
      const paymentStatus = status === 'cancelled' ? 'refunded' : 'paid';
      const daysAgo = Math.floor((i / 28) * 14) + (i % 3 === 0 ? 0 : 1);
      const off = `-${daysAgo} days`;
      const num = `AX-DEMO-${String(i + 1).padStart(4, '0')}`;
      const shipped = ['shipped', 'delivered'].includes(status);
      const id = insOrder.run(num, uid, status, paymentStatus, subtotal, shipping, tax, subtotal + shipping + tax, address(u.name), u.email,
        shipped ? 'Blue Dart' : null, shipped ? `BD${700000 + i * 137}` : null, off, off).lastInsertRowid;
      for (const l of lines) insItem.run(id, l.p.id, l.p.sku, l.p.name, l.price, l.qty);
      insEvt.run(id, 'paid', 'Payment received', off);
      if (status !== 'paid') insEvt.run(id, status, status === 'cancelled' ? 'Cancelled by customer' : status, off);
    }
    const rev = db.prepare('INSERT OR IGNORE INTO reviews (product_id, user_id, rating, title, body, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\', ?))');
    const titles = [[5, 'Fits perfectly', 'Matched the old part exactly and went on in minutes.'], [5, 'Great value', 'Does the job and cost less than the garage quoted.'],
      [4, 'Good quality', 'Solid build. Packaging could be better.'], [4, 'Works well', 'No issues after a few weeks of daily use.'], [3, 'Okay', 'Fine for the price, nothing special.']];
    const bought = db.prepare(`SELECT DISTINCT o.user_id, i.product_id FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'delivered'`).all();
    bought.forEach((b, k) => { const t = titles[k % titles.length]; rev.run(b.product_id, b.user_id, t[0], t[1], t[2], `-${k % 10} days`); });
  })();
}

// `npm run seed` rebuilds the database from scratch.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  if (process.argv.includes('--reset')) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbFile + suffix, { force: true });
  }
  const db = openDb(config.dbFile);
  await seedDatabase(db);
  const n = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  console.log(`Seeded ${n} products.\nAdmin:    ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}\nCustomer: ${DEMO_CUSTOMER.email} / ${DEMO_CUSTOMER.password}`);
}
