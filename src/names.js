/**
 * Common-name lookup for houseplants.
 *
 * Two sources, in order:
 *   1. This curated list — instant, works offline, and knows the horticultural
 *      trade names ("Pink Princess", "ZZ plant") that scientific databases
 *      generally don't carry.
 *   2. The iNaturalist API, for anything the list misses.
 *
 * Where a common name honestly maps to more than one species, all of them are
 * offered rather than a guess being made for you. Nothing is filled in
 * automatically — you always pick.
 */

const LIST = [
  { keys: ["monstera", "swiss cheese plant", "split leaf philodendron"], options: ["Monstera deliciosa", "Monstera adansonii"] },
  { keys: ["swiss cheese vine", "monstera adansonii"], options: ["Monstera adansonii"] },
  { keys: ["mini monstera", "rhaphidophora"], options: ["Rhaphidophora tetrasperma"] },
  { keys: ["thai constellation"], options: ["Monstera deliciosa 'Thai Constellation'"] },
  { keys: ["monstera albo", "albo variegata", "albo monstera"], options: ["Monstera deliciosa 'Albo Variegata'"] },
  { keys: ["monstera aurea", "aurea variegata"], options: ["Monstera deliciosa 'Aurea'"] },
  { keys: ["monstera mint"], options: ["Monstera deliciosa 'Mint'"] },
  { keys: ["white knight"], options: ["Philodendron 'White Knight'"] },
  { keys: ["white princess"], options: ["Philodendron 'White Princess'"] },
  { keys: ["white wizard"], options: ["Philodendron 'White Wizard'"] },
  { keys: ["florida beauty"], options: ["Philodendron 'Florida Beauty'"] },
  { keys: ["manjula", "manjula pothos"], options: ["Epipremnum aureum 'Manjula'"] },
  { keys: ["njoy", "n joy pothos"], options: ["Epipremnum aureum 'N'Joy'"] },
  { keys: ["snow queen pothos"], options: ["Epipremnum aureum 'Snow Queen'"] },
  { keys: ["neon pothos"], options: ["Epipremnum aureum 'Neon'"] },
  { keys: ["tineke", "rubber plant tineke"], options: ["Ficus elastica 'Tineke'"] },
  { keys: ["ruby rubber plant", "ficus ruby"], options: ["Ficus elastica 'Ruby'"] },
  { keys: ["krimson queen", "hoya tricolor"], options: ["Hoya carnosa 'Krimson Queen'"] },
  { keys: ["krimson princess"], options: ["Hoya carnosa 'Krimson Princess'"] },
  { keys: ["syngonium albo", "albo syngonium"], options: ["Syngonium podophyllum 'Albo Variegatum'"] },
  { keys: ["syngonium milk confetti"], options: ["Syngonium podophyllum 'Milk Confetti'"] },
  { keys: ["marble queen pothos"], options: ["Epipremnum aureum 'Marble Queen'"] },
  { keys: ["variegated string of hearts"], options: ["Ceropegia woodii 'Variegata'"] },
  { keys: ["variegated rubber plant"], options: ["Ficus elastica 'Tineke'", "Ficus elastica 'Ruby'"] },
  { keys: ["moonlight philodendron"], options: ["Philodendron 'Moonlight'"] },
  { keys: ["prince of orange"], options: ["Philodendron 'Prince of Orange'"] },
  { keys: ["lemon lime philodendron"], options: ["Philodendron hederaceum 'Lemon Lime'"] },
  { keys: ["cebu blue"], options: ["Epipremnum pinnatum 'Cebu Blue'"] },
  { keys: ["silver satin", "exotica scindapsus"], options: ["Scindapsus pictus 'Exotica'"] },
  { keys: ["variegated monstera adansonii"], options: ["Monstera adansonii 'Variegata'"] },
  { keys: ["alocasia frydek", "green velvet alocasia"], options: ["Alocasia micholitziana 'Frydek'"] },
  { keys: ["variegated frydek"], options: ["Alocasia micholitziana 'Frydek Variegata'"] },
  { keys: ["stromanthe triostar", "triostar"], options: ["Stromanthe thalia 'Triostar'"] },
  { keys: ["calathea white fusion", "white fusion"], options: ["Goeppertia lietzei 'White Fusion'"] },
  { keys: ["pink princess", "pink princess philodendron"], options: ["Philodendron erubescens"] },
  { keys: ["heartleaf philodendron", "sweetheart plant"], options: ["Philodendron hederaceum"] },
  { keys: ["philodendron brasil", "brasil"], options: ["Philodendron hederaceum 'Brasil'"] },
  { keys: ["micans", "velvet leaf philodendron"], options: ["Philodendron hederaceum var. hederaceum"] },
  { keys: ["birkin"], options: ["Philodendron 'Birkin'"] },
  { keys: ["silver sword"], options: ["Philodendron hastatum"] },
  { keys: ["snake plant", "mother in laws tongue", "mother-in-law's tongue", "sansevieria"], options: ["Dracaena trifasciata", "Sansevieria trifasciata"] },
  { keys: ["zz plant", "zanzibar gem"], options: ["Zamioculcas zamiifolia"] },
  { keys: ["pothos", "devils ivy", "devil's ivy", "golden pothos"], options: ["Epipremnum aureum"] },
  { keys: ["marble queen"], options: ["Epipremnum aureum 'Marble Queen'"] },
  { keys: ["satin pothos", "silver pothos", "scindapsus"], options: ["Scindapsus pictus"] },
  { keys: ["peace lily"], options: ["Spathiphyllum wallisii"] },
  { keys: ["spider plant"], options: ["Chlorophytum comosum"] },
  { keys: ["rubber plant", "rubber tree", "rubber fig"], options: ["Ficus elastica"] },
  { keys: ["fiddle leaf fig"], options: ["Ficus lyrata"] },
  { keys: ["weeping fig"], options: ["Ficus benjamina"] },
  { keys: ["bird of paradise"], options: ["Strelitzia reginae", "Strelitzia nicolai"] },
  { keys: ["chinese money plant", "pilea", "pancake plant"], options: ["Pilea peperomioides"] },
  { keys: ["aluminum plant", "aluminium plant"], options: ["Pilea cadierei"] },
  { keys: ["string of pearls"], options: ["Curio rowleyanus", "Senecio rowleyanus"] },
  { keys: ["string of hearts"], options: ["Ceropegia woodii"] },
  { keys: ["string of dolphins"], options: ["Curio × peregrinus"] },
  { keys: ["string of turtles"], options: ["Peperomia prostrata"] },
  { keys: ["jade plant", "money plant"], options: ["Crassula ovata"] },
  { keys: ["aloe", "aloe vera"], options: ["Aloe vera"] },
  { keys: ["christmas cactus", "holiday cactus"], options: ["Schlumbergera × buckleyi", "Schlumbergera truncata"] },
  { keys: ["thanksgiving cactus", "crab cactus"], options: ["Schlumbergera truncata"] },
  { keys: ["prayer plant"], options: ["Maranta leuconeura"] },
  { keys: ["rattlesnake plant"], options: ["Goeppertia insignis", "Calathea lancifolia"] },
  { keys: ["calathea orbifolia"], options: ["Goeppertia orbifolia"] },
  { keys: ["peacock plant"], options: ["Goeppertia makoyana"] },
  { keys: ["watermelon peperomia"], options: ["Peperomia argyreia"] },
  { keys: ["baby rubber plant"], options: ["Peperomia obtusifolia"] },
  { keys: ["nerve plant"], options: ["Fittonia albivenis"] },
  { keys: ["polka dot plant"], options: ["Hypoestes phyllostachya"] },
  { keys: ["polka dot begonia"], options: ["Begonia maculata"] },
  { keys: ["rex begonia"], options: ["Begonia rex"] },
  { keys: ["arrowhead plant", "arrowhead vine", "syngonium"], options: ["Syngonium podophyllum"] },
  { keys: ["dumb cane", "dieffenbachia"], options: ["Dieffenbachia seguine"] },
  { keys: ["corn plant"], options: ["Dracaena fragrans"] },
  { keys: ["dragon tree"], options: ["Dracaena marginata"] },
  { keys: ["lucky bamboo"], options: ["Dracaena sanderiana"] },
  { keys: ["parlor palm", "parlour palm"], options: ["Chamaedorea elegans"] },
  { keys: ["areca palm", "butterfly palm"], options: ["Dypsis lutescens"] },
  { keys: ["ponytail palm"], options: ["Beaucarnea recurvata"] },
  { keys: ["kentia palm"], options: ["Howea forsteriana"] },
  { keys: ["majesty palm"], options: ["Ravenea rivularis"] },
  { keys: ["boston fern"], options: ["Nephrolepis exaltata"] },
  { keys: ["birds nest fern", "bird's nest fern"], options: ["Asplenium nidus"] },
  { keys: ["staghorn fern"], options: ["Platycerium bifurcatum"] },
  { keys: ["maidenhair fern"], options: ["Adiantum raddianum"] },
  { keys: ["kangaroo paw fern"], options: ["Zealandia pustulata"] },
  { keys: ["air plant", "tillandsia"], options: ["Tillandsia"] },
  { keys: ["moth orchid", "orchid", "phalaenopsis"], options: ["Phalaenopsis"] },
  { keys: ["african violet"], options: ["Streptocarpus ionanthus", "Saintpaulia ionantha"] },
  { keys: ["wandering dude", "inch plant", "wandering jew"], options: ["Tradescantia zebrina"] },
  { keys: ["purple heart"], options: ["Tradescantia pallida"] },
  { keys: ["croton"], options: ["Codiaeum variegatum"] },
  { keys: ["umbrella plant", "schefflera"], options: ["Heptapleurum arboricola", "Schefflera arboricola"] },
  { keys: ["money tree"], options: ["Pachira aquatica"] },
  { keys: ["norfolk island pine"], options: ["Araucaria heterophylla"] },
  { keys: ["cast iron plant"], options: ["Aspidistra elatior"] },
  { keys: ["hoya", "wax plant"], options: ["Hoya carnosa"] },
  { keys: ["anthurium", "flamingo flower"], options: ["Anthurium andraeanum"] },
  { keys: ["elephant ear"], options: ["Alocasia", "Colocasia esculenta"] },
  { keys: ["alocasia polly", "african mask plant"], options: ["Alocasia × amazonica"] },
  { keys: ["burros tail", "burro's tail", "donkey tail"], options: ["Sedum morganianum"] },
  { keys: ["echeveria", "hen and chicks"], options: ["Echeveria"] },
  { keys: ["zebra plant", "haworthia"], options: ["Haworthiopsis attenuata"] },
  { keys: ["panda plant"], options: ["Kalanchoe tomentosa"] },
  { keys: ["fishbone cactus", "ric rac cactus", "zigzag cactus"], options: ["Disocactus anguliger"] },
  { keys: ["bunny ear cactus"], options: ["Opuntia microdasys"] },
  { keys: ["golden barrel cactus"], options: ["Echinocactus grusonii"] },
  { keys: ["lipstick plant"], options: ["Aeschynanthus radicans"] },
  { keys: ["goldfish plant"], options: ["Nematanthus gregarius"] },
  { keys: ["coffee plant"], options: ["Coffea arabica"] },
  { keys: ["ficus audrey"], options: ["Ficus benghalensis"] },
  { keys: ["banana plant"], options: ["Musa acuminata"] },
  { keys: ["ti plant", "hawaiian ti"], options: ["Cordyline fruticosa"] },
  { keys: ["yucca"], options: ["Yucca elephantipes"] },
  { keys: ["oyster plant"], options: ["Tradescantia spathacea"] },
  { keys: ["arabian jasmine"], options: ["Jasminum sambac"] },
  { keys: ["bamboo palm"], options: ["Chamaedorea seifrizii"] },
];

const normalise = (s) =>
  s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9× ]+/g, " ").replace(/\s+/g, " ").trim();

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word containment, so "snake plant" doesn't match "rattlesnake plant".
const contains = (haystack, needle) =>
  new RegExp(`(^|\\s)${escape(needle)}($|\\s)`).test(haystack);

/**
 * Pull a cultivar epithet out of a name string.
 * "Monstera deliciosa 'Thai Constellation'" → species plus cultivar, so each
 * can be set in the type botanical convention actually calls for.
 */
export function splitName(value) {
  if (!value) return { scientific: "", cultivar: "" };
  // greedy inner group, so cultivars containing an apostrophe survive ('N'Joy')
  const m = String(value).match(/^(.*?)\s*['’"](.+)['’"]\s*$/);
  if (m) return { scientific: m[1].trim(), cultivar: m[2].trim() };
  return { scientific: String(value).trim(), cultivar: "" };
}

const tokens = (s) => normalise(s).split(" ").filter(Boolean);

export function lookupLocal(common) {
  const q = normalise(common);
  if (q.length < 3) return [];

  const qTokens = tokens(q);
  const hits = [];
  for (const entry of LIST) {
    for (const key of entry.keys) {
      const k = normalise(key);
      if (k === q || contains(k, q) || contains(q, k)) {
        const keyScore = k === q ? 0 : 1;
        entry.options.forEach((o) => {
          // an option that accounts for more of what was typed ranks higher, so
          // "monstera thai constellation" leads with the cultivar, not the species
          const oTokens = new Set(tokens(o));
          const matched = qTokens.filter((t) => oTokens.has(t)).length;
          hits.push({ scientific: o, source: "list", score: keyScore - matched });
        });
        break;
      }
    }
  }

  hits.sort((a, b) => a.score - b.score);
  const seen = new Set();
  return hits.filter((h) => (seen.has(h.scientific) ? false : seen.add(h.scientific)));
}
