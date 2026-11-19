/**
 * Risk-Specific Structured JSON Checklists & Image Downscaling Utility
 * for TwinCover's Guided Field Walk-Through Module.
 */

export const WALKTHROUGH_RISK_TEMPLATES = {
  commercial_property_cope: {
    key: 'commercial_property_cope',
    label: 'Commercial Property / COPE',
    specialtyLine: 'general_commercial',
    items: [
      {
        id: 'exterior_elevations',
        label: 'Exterior Elevations & Construction Class',
        category: 'Construction',
        promptHint: 'Snap front/side walls to confirm brick, masonry, steel, or wood frame and adjoining exposures.',
        copeFieldKeys: ['construction_type', 'exposures'],
      },
      {
        id: 'roof_surface',
        label: 'Roof Surface, Age & Drainage',
        category: 'Construction',
        promptHint: 'Capture roof membrane/shingles, scuppers, or ask owner for roof replacement year.',
        copeFieldKeys: ['roof_condition'],
      },
      {
        id: 'electrical_panel',
        label: 'Main Electrical Panel & Amperage',
        category: 'Protection / Systems',
        promptHint: 'Open panel door; capture main breaker amperage (e.g. 200A) and manufacturer label.',
        copeFieldKeys: ['electrical_service'],
      },
      {
        id: 'fire_protection',
        label: 'Fire Protection & Sprinkler Riser',
        category: 'Protection',
        promptHint: 'Snap sprinkler riser gauge/tag, fire extinguishers, or ULC central-station fire alarm panel.',
        copeFieldKeys: ['fire_protection'],
      },
      {
        id: 'hvac_mechanical',
        label: 'HVAC, Heating & Plumbing',
        category: 'Systems',
        promptHint: 'Capture furnace/rooftop unit nameplate or mechanical room piping.',
        copeFieldKeys: ['hvac_plumbing'],
      },
      {
        id: 'life_safety',
        label: 'Life Safety, Exits & Security Controls',
        category: 'Security & Life Safety',
        promptHint: 'Snap illuminated exit signs, panic bars, deadbolts, CCTV, or burglar alarm keypad.',
        copeFieldKeys: ['security_controls'],
      },
      {
        id: 'housekeeping_hazards',
        label: 'Housekeeping, Occupancy & Peak Stock (TIV)',
        category: 'Occupancy & Values',
        promptHint: 'Snap main floor/stock & speak approximate square footage and peak inventory value ($).',
        copeFieldKeys: ['business_operations', 'total_insurable_value'],
      },
    ],
  },
  habitational: {
    key: 'habitational',
    label: 'Habitational / Multi-Family',
    specialtyLine: 'general_commercial',
    items: [
      {
        id: 'exterior_elevations',
        label: 'Building Exterior, Siding & Balconies',
        category: 'Construction',
        promptHint: 'Snap exterior facade, siding/brick condition, and balcony railings.',
        copeFieldKeys: ['construction_type'],
      },
      {
        id: 'roof_surface',
        label: 'Roof Surface, Gutters & Downspouts',
        category: 'Construction',
        promptHint: 'Capture roof pitch, age, and ice-dam/drainage runoff.',
        copeFieldKeys: ['roof_condition'],
      },
      {
        id: 'electrical_panel',
        label: 'Main Electrical Service & Sub-Panels',
        category: 'Systems',
        promptHint: 'Verify 100A/200A+ breaker panels (flag any Federal Pacific / Stab-Lok or fuses).',
        copeFieldKeys: ['electrical_service'],
      },
      {
        id: 'hvac_mechanical',
        label: 'Boiler, Hot Water Tanks & Plumbing Type',
        category: 'Systems',
        promptHint: 'Check copper/PEX vs. Kitec/Poly-B plumbing and hot water tank manufacture date.',
        copeFieldKeys: ['hvac_plumbing'],
      },
      {
        id: 'fire_protection',
        label: 'Common Area Smoke/CO Alarms & Sprinklers',
        category: 'Protection',
        promptHint: 'Snap fire alarm annunciator panel, pull stations, and hallway extinguishers.',
        copeFieldKeys: ['fire_protection'],
      },
      {
        id: 'life_safety',
        label: 'Egress Stairs, Handrails & Emergency Lighting',
        category: 'Life Safety',
        promptHint: 'Capture illuminated exit signs, stairwell handrails, and unobstructed exits.',
        copeFieldKeys: ['security_controls'],
      },
    ],
  },
  manufacturing: {
    key: 'manufacturing',
    label: 'Manufacturing & Industrial',
    specialtyLine: 'construction',
    items: [
      {
        id: 'exterior_elevations',
        label: 'Plant Exterior, Yard Storage & Loading Docks',
        category: 'Construction & Exposure',
        promptHint: 'Snap steel/concrete walls, loading bays, and outdoor combustible/pallet storage.',
        copeFieldKeys: ['construction_type'],
      },
      {
        id: 'electrical_panel',
        label: 'High-Voltage Switchgear & Transformers',
        category: 'Systems',
        promptHint: 'Capture main switchgear room, clearances (36 in.), and thermographic sticker.',
        copeFieldKeys: ['electrical_service'],
      },
      {
        id: 'fire_protection',
        label: 'Sprinkler Riser, ESFR Heads & Fire Pump',
        category: 'Protection',
        promptHint: 'Snap sprinkler riser inspection tag (NFPA 25) and fire department connection.',
        copeFieldKeys: ['fire_protection'],
      },
      {
        id: 'hvac_mechanical',
        label: 'Dust Collection, Compressors & Boilers',
        category: 'Operations',
        promptHint: 'Capture dust collectors, welding booths, or spray paint booths if present.',
        copeFieldKeys: ['hvac_plumbing'],
      },
      {
        id: 'life_safety',
        label: 'Emergency Exits, Forklift Aisles & Guarding',
        category: 'Life Safety',
        promptHint: 'Snap marked pedestrian walkways, machine guarding, and eyewash stations.',
        copeFieldKeys: ['security_controls'],
      },
      {
        id: 'housekeeping_hazards',
        label: 'Flammable Liquids, Housekeeping & Equipment TIV',
        category: 'Hazards & Values',
        promptHint: 'Check UL-listed flammable cabinets and speak total machinery/stock values ($).',
        copeFieldKeys: ['total_project_value'],
      },
    ],
  },
  restaurant_hospitality: {
    key: 'restaurant_hospitality',
    label: 'Restaurant & Hospitality',
    specialtyLine: 'general_commercial',
    items: [
      {
        id: 'fire_protection',
        label: 'Kitchen Hood & UL-300 Ansul Suppression',
        category: 'Kitchen Fire Protection',
        promptHint: 'Snap commercial hood, Ansul wet-chemical nozzles, K-class extinguisher, and semi-annual tag.',
        copeFieldKeys: ['fire_protection'],
      },
      {
        id: 'housekeeping_hazards',
        label: 'Grease Filters, Deep Fryers & Exhaust Ducts',
        category: 'Housekeeping',
        promptHint: 'Check baffle grease filters, fryer clearances (16 in.), and hood cleaning sticker.',
        copeFieldKeys: ['business_operations'],
      },
      {
        id: 'electrical_panel',
        label: 'Main Electrical Panel & Shutoffs',
        category: 'Systems',
        promptHint: 'Snap main breaker panel and verify manual gas/electric fuel shutoff access.',
        copeFieldKeys: ['electrical_service'],
      },
      {
        id: 'life_safety',
        label: 'Dining Egress, Exit Signs & Seating Capacity',
        category: 'Life Safety',
        promptHint: 'Capture unobstructed rear exit doors, panic hardware, and emergency lighting.',
        copeFieldKeys: ['security_controls'],
      },
      {
        id: 'exterior_elevations',
        label: 'Exterior Building, Dumpster & Patio',
        category: 'Construction & Exposure',
        promptHint: 'Snap exterior facade and verify dumpster is at least 10 ft from combustible walls.',
        copeFieldKeys: ['construction_type'],
      },
    ],
  },
};

/**
 * Downscale a captured photo File or Blob to max `maxEdge` (768px) on its longest edge
 * using an HTML5 Canvas so mobile RAM stays low and inference is fast.
 */
export async function downscaleImageToMaxEdge(fileOrBlob, maxEdge = 768) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(fileOrBlob);
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxEdge || height > maxEdge) {
          if (width >= height) {
            height = Math.round((height * maxEdge) / width);
            width = maxEdge;
          } else {
            width = Math.round((width * maxEdge) / height);
            height = maxEdge;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objUrl);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas image downscaling failed.'));
            }
          },
          'image/jpeg',
          0.82
        );
      } catch (err) {
        URL.revokeObjectURL(objUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Failed to decode captured image.'));
    };
    img.src = objUrl;
  });
}
