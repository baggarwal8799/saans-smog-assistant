/** Sustainable swaps: cleaner cooking, safe heating, no burning, smoke-free mosquito control. */
import {
  CLEAN_FUEL_KITCHEN_CUT,
  MOSQUITO_COIL_CIGARETTES,
  RANGE_HOOD_CUT,
  WASTE_BURNED_KG_PER_PERSON_WEEK,
  WASTE_BURNING_PM25_G_PER_KG,
  WEEKS_PER_MONTH,
  round,
} from '../impact.js';
import { L, SCOPE, forMembers, local, n, persons, type RecDraft, type RuleInput } from './shared.js';
import type { Concern } from '../types.js';

export function cookingRec({ profile: p, india }: RuleInput): RecDraft {
  const kids = forMembers(p, { children: L(' Keep children out of the kitchen while it burns.', ' चूल्हा जलते समय बच्चों को रसोई से दूर रखें।') });
  const fuelCut = round(CLEAN_FUEL_KITCHEN_CUT * 100);
  const hoodCut = round(RANGE_HOOD_CUT * 100);
  if (p.cooking === 'biomass' || p.cooking === 'kerosene') {
    return {
      id: 'clean-cooking',
      category: 'swap',
      priority: 1,
      title: L('Switch to LPG or induction for daily cooking', 'रोज़ का खाना LPG या इंडक्शन पर बनाएँ'),
      detail: local(
        india,
        L(
          `Smoke from wood, dung or kerosene is the biggest indoor pollution source in many homes, and whoever is near the stove breathes most of it. Under the PM Ujjwala Yojana, eligible households can get a subsidised LPG connection.${kids.en}`,
          `लकड़ी, उपले या मिट्टी के तेल का धुआँ कई घरों में अंदर के प्रदूषण का सबसे बड़ा स्रोत है, और चूल्हे के पास रहने वाले इसमें सबसे ज़्यादा साँस लेते हैं। प्रधानमंत्री उज्ज्वला योजना में पात्र परिवारों को सस्ता LPG कनेक्शन मिल सकता है।${kids.hi}`,
        ),
        L(
          `Smoke from wood, dung or kerosene is the biggest indoor pollution source in many homes, and whoever is near the stove breathes most of it. Ask your local authority about clean-cooking subsidies.${kids.en}`,
          `लकड़ी, उपले या मिट्टी के तेल का धुआँ कई घरों में अंदर के प्रदूषण का सबसे बड़ा स्रोत है, और चूल्हे के पास रहने वाले इसमें सबसे ज़्यादा साँस लेते हैं। साफ़ ईंधन पर मिलने वाली सरकारी मदद के बारे में स्थानीय प्रशासन से पूछें।${kids.hi}`,
        ),
      ),
      explanation: L(
        `Kitchen PM2.5 with solid fuels often runs above 500 µg/m³ while cooking, vs typically under 100 µg/m³ with LPG: roughly ${fuelCut}% less kitchen smoke.`,
        `ठोस ईंधन से खाना बनाते समय रसोई का PM2.5 अक्सर 500 µg/m³ से ऊपर होता है, LPG के साथ आमतौर पर 100 से कम: रसोई का धुआँ लगभग ${fuelCut}% कम।`,
      ),
      exposureCutPct: fuelCut,
      scope: SCOPE.kitchen,
      safety: true,
    };
  }
  return {
    id: 'kitchen-exhaust',
    category: 'indoor',
    priority: 3,
    title: L('Run the exhaust or chimney while cooking, and 10 minutes after', 'खाना बनाते समय और 10 मिनट बाद तक एग्ज़ॉस्ट या चिमनी चलाएँ'),
    detail: L(
      'Frying and high-heat cooking make fine particles even on gas. Use lids, cook on the back burners under the hood, and skip deep-frying on the worst days.',
      'गैस पर भी तलने और तेज़ आँच से बारीक कण बनते हैं। ढक्कन लगाएँ, चिमनी के नीचे पीछे वाले बर्नर पर पकाएँ, और सबसे खराब दिनों में डीप-फ़्राई न करें।',
    ),
    explanation: L(
      `Studies of vented range hoods find cooking PM2.5 in the kitchen falls by roughly a third to a half; we count the conservative ${hoodCut}%.`,
      `चिमनी वाले हुड के अध्ययनों में रसोई का PM2.5 लगभग एक-तिहाई से आधा घटता है; हम कम वाला ${hoodCut}% मानते हैं।`,
    ),
    exposureCutPct: hoodCut,
    scope: SCOPE.kitchen,
  };
}

/** Carbon monoxide can kill overnight, so every fuel-burning heater gets a safety step. */
export function heatingRec({ profile: p, india }: RuleInput): RecDraft | null {
  if (p.heating === 'gas') {
    return {
      id: 'gas-heater-safety',
      category: 'swap',
      priority: 1,
      title: L('Gas heater: never run it overnight or in a sealed room', 'गैस हीटर: रात भर या बंद कमरे में कभी न चलाएँ'),
      detail: L(
        'A gas heater without a flue releases carbon monoxide and nitrogen dioxide into the room. Keep a window slightly open while it runs, switch it off before sleeping, and fit a carbon monoxide alarm. An oil-filled electric heater adds no fumes.',
        'बिना चिमनी वाला गैस हीटर कमरे में कार्बन मोनोऑक्साइड और नाइट्रोजन डाइऑक्साइड छोड़ता है। चलते समय खिड़की थोड़ी खुली रखें, सोने से पहले बंद कर दें, और कार्बन मोनोऑक्साइड अलार्म लगाएँ। तेल वाला बिजली का हीटर कोई धुआँ नहीं छोड़ता।',
      ),
      explanation: L(
        'Unvented gas heaters add carbon monoxide and nitrogen dioxide indoors (US EPA). Switching to electric heat removes that source; if you keep gas, ventilation and a carbon monoxide alarm are the safeguards.',
        'बिना चिमनी वाले गैस हीटर घर के अंदर कार्बन मोनोऑक्साइड और नाइट्रोजन डाइऑक्साइड बढ़ाते हैं (US EPA)। बिजली के हीटर से यह स्रोत हट जाता है; गैस रखें तो हवा आने देना और कार्बन मोनोऑक्साइड अलार्म ही बचाव हैं।',
      ),
      removesSource: true,
      safety: true,
    };
  }
  if (p.heating !== 'coal' && p.heating !== 'wood') return null;
  // "Angithi" is the North Indian word; elsewhere the same danger is a brazier or open fire.
  const stove = local(india, L('An angithi or brazier', 'अंगीठी'), L('A charcoal brazier or open fire', 'कोयले या लकड़ी की आग'));
  return {
    id: 'safe-heating',
    category: 'swap',
    priority: 1,
    title: L('Never burn coal or wood in a closed room: switch to an electric heater', 'बंद कमरे में कभी कोयला या लकड़ी न जलाएँ: बिजली का हीटर लें'),
    detail: L(
      `${stove.en} in a shut room can kill through carbon monoxide, which has no smell. Use an oil-filled electric heater, layers and a hot-water bottle. If you must burn fuel, keep a window open and never sleep with it lit.`,
      `बंद कमरे में ${stove.hi} कार्बन मोनोऑक्साइड से जान ले सकती है, जिसकी कोई गंध नहीं होती। तेल वाला बिजली का हीटर, गर्म कपड़े और गर्म पानी की बोतल इस्तेमाल करें। जलाना ही पड़े तो खिड़की खुली रखें और आग जलती छोड़कर कभी न सोएँ।`,
    ),
    explanation: L(
      'Burning coal or wood indoors adds smoke and carbon monoxide on top of the outdoor smog that leaks in. Electric heat adds neither, so the whole source disappears.',
      'घर में कोयला या लकड़ी जलाने से बाहर से आने वाले स्मॉग के ऊपर और धुआँ व कार्बन मोनोऑक्साइड जुड़ता है। बिजली की गर्मी से ये दोनों नहीं बनते, यानी पूरा स्रोत हट जाता है।',
    ),
    removesSource: true,
    safety: true,
  };
}

/** The PM2.5 a household's burning puts into the street each month, from its size. */
export function wastePm25GPerMonth(people: number): number {
  return round(people * WASTE_BURNED_KG_PER_PERSON_WEEK * WASTE_BURNING_PM25_G_PER_KG * WEEKS_PER_MONTH);
}

export function wasteRec({ profile: p, india }: RuleInput): RecDraft | null {
  if (!p.burnsWaste) return null;
  const report = local(
    india,
    L('report open burning to your municipal app', 'खुले में जलाने की शिकायत नगर निगम ऐप पर करें'),
    L('report open burning to your local council', 'खुले में जलाने की शिकायत स्थानीय प्रशासन से करें'),
  );
  const who = persons(p.householdSize);
  const kg = WASTE_BURNED_KG_PER_PERSON_WEEK;
  const g = WASTE_BURNING_PM25_G_PER_KG;
  const total = wastePm25GPerMonth(p.householdSize);
  return {
    id: 'stop-burning',
    category: 'swap',
    priority: 1,
    title: L('Compost leaves and hand waste to collection instead of burning', 'पत्ते और कूड़ा जलाने की जगह खाद बनाएँ या कूड़ा गाड़ी को दें'),
    detail: L(
      `Burning mixed waste or leaves releases dense smoke right at breathing height for the whole street. Use a compost pit or bin for leaves and kitchen scraps, and ${report.en}.`,
      `कूड़ा या पत्ते जलाने से पूरी गली में साँस की ऊँचाई पर घना धुआँ फैलता है। पत्तों और रसोई के कचरे के लिए खाद का गड्ढा या डिब्बा बनाएँ, और ${report.hi}।`,
    ),
    explanation: L(
      `Each kg of household waste burned in the open releases ≈ ${g} g of PM2.5. Assuming ${kg} kg burned per person a week: ${who.en} × ${kg} kg × ${g} g/kg × ${WEEKS_PER_MONTH} weeks ≈ ${n(total)} g of PM2.5 a month kept out of your street air.`,
      `खुले में जलाया गया हर किलो कूड़ा ≈ ${g} ग्राम PM2.5 छोड़ता है। हर व्यक्ति का हफ़्ते में ${kg} किलो जलना मानें: ${who.hi} × ${kg} किलो × ${g} ग्राम/किलो × ${WEEKS_PER_MONTH} हफ़्ते ≈ हर महीने ${n(total)} ग्राम PM2.5 आपकी गली की हवा में नहीं जाता।`,
    ),
    removesSource: true,
  };
}

/** Where coils are unlikely, only incense and candles are left: worth a word on smoggy days, never urgent. */
function incenseRec(concern: Concern): RecDraft | null {
  if (concern === 'low') return null;
  return {
    id: 'no-smoke-indoors',
    category: 'swap',
    priority: 3,
    title: L('Skip incense and candles on smoggy days', 'स्मॉग वाले दिनों में अगरबत्ती और मोमबत्ती न जलाएँ'),
    detail: L(
      'Smoke you make indoors is trapped with you when windows are shut for smog. An electric diffuser or LED candles add no smoke.',
      'स्मॉग में खिड़कियाँ बंद होने पर घर के अंदर का धुआँ आपके साथ ही फँसा रहता है। बिजली का डिफ़्यूज़र या LED मोमबत्ती धुआँ नहीं करते।',
    ),
    explanation: L(
      'Burning incense and candles releases fine particles straight into the room you breathe in (US EPA). Skipping them removes that source.',
      'अगरबत्ती और मोमबत्ती जलाने से बारीक कण सीधे उसी कमरे में फैलते हैं जिसमें आप साँस लेते हैं (US EPA)। इन्हें छोड़ने से वह स्रोत हट जाता है।',
    ),
    removesSource: true,
    shutsWindows: true,
    unreported: true,
  };
}

export function coilRec({ concern, mosquitoes }: RuleInput): RecDraft | null {
  if (!mosquitoes) return incenseRec(concern);
  const { low, high } = MOSQUITO_COIL_CIGARETTES;
  // "Windows shut for smog" is true only on a smoggy day; on a clean one the smoke is still breathed indoors.
  const shut = concern !== 'low';
  return {
    id: 'no-smoke-indoors',
    category: 'swap',
    priority: 2,
    title: L('Swap mosquito coils, incense and candles for nets or a plug-in repellent', 'मच्छर कॉइल, अगरबत्ती और मोमबत्ती की जगह मच्छरदानी या प्लग-इन रिपेलेंट'),
    detail: shut
      ? L(
          'Smoke you make indoors is trapped with you when windows are shut for smog. Mosquito nets, window mesh and plug-in vaporisers add no smoke.',
          'स्मॉग में खिड़कियाँ बंद होने पर घर के अंदर का धुआँ आपके साथ ही फँसा रहता है। मच्छरदानी, खिड़की की जाली और प्लग-इन वेपोराइज़र धुआँ नहीं करते।',
        )
      : L(
          'Smoke you make indoors goes straight into the air your family breathes. Mosquito nets, window mesh and plug-in vaporisers add no smoke.',
          'घर के अंदर बना धुआँ सीधे उसी हवा में जाता है जिसमें परिवार साँस लेता है। मच्छरदानी, खिड़की की जाली और प्लग-इन वेपोराइज़र धुआँ नहीं करते।',
        ),
    explanation: L(
      `A lab study (Liu et al., 2003) found one burning mosquito coil gives off as much PM2.5 as ${low}–${high} cigarettes. Dropping it removes that whole source.`,
      `एक लैब अध्ययन (Liu et al., 2003) में एक जलती मच्छर कॉइल से ${low}–${high} सिगरेट जितना PM2.5 निकला। इसे छोड़ने से वह पूरा स्रोत हट जाता है।`,
    ),
    removesSource: true,
    shutsWindows: shut,
    unreported: true,
  };
}
