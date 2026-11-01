/*
 * Game data used by the editor, taken from the game's English locale
 * (build d1eb6005e172). Armor piece names are assembled from set + noun
 * the way the game does ("{set} {noun}" or "{noun} of {set}"); the choice
 * of form per set follows the classic item names and may differ in places.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Catalog = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CLASSES = [
    { id: 1, key: "warrior", name: "Warrior", armor: "plate", color: "#C79C6E",
      sets: ["Recruit's", "Valor", "Might", "Wrath", "Dreadnaught"],
      weapons: [["Worn Claymore", "Bastard Sword of Valor", "Blackhand Doomsaw", "Ravager's Greatblade", "Sulfuras, Hand of Ragnaros"]] },
    { id: 2, key: "paladin", name: "Paladin", armor: "plate", color: "#F58CBA",
      sets: ["Squire's", "Lightforge", "Lawbringer", "Judgement", "Redemption"],
      weapons: [["Wooden Maul", "Hammer of the Squire", "Hammer of the Lightforge", "Lightforged Hammer", "Ashbringer"]] },
    { id: 3, key: "hunter", name: "Hunter", armor: "mail", color: "#ABD473",
      sets: ["Tracker's", "Beaststalker's", "Giantstalker's", "Dragonstalker's", "Cryptstalker"],
      weapons: [["Short Bow", "Hunting Bow of the Wilds", "Bow of the Dragonflight", "Ahn'Qiraj Rifle", "Rhok'delar, Longbow of the Ancient Keepers"]] },
    { id: 4, key: "rogue", name: "Rogue", armor: "leather", color: "#E6D84E",
      sets: ["Footpad's", "Shadowcraft", "Nightslayer", "Bloodfang", "Bonescythe"],
      weapons: [["Worn Dagger", "Assassin's Blade", "Shadowcraft Dirk", "Blackwing Shiv", "Thunderfury, Blessed Blade of the Windseeker"],
                ["Rusty Shiv", "Thief's Blade", "Nightslayer Kris", "Fang of the Faceless", "Kingsfall"]] },
    { id: 5, key: "priest", name: "Priest", armor: "cloth", color: "#B9BDC4",
      sets: ["Acolyte's", "Devout", "Prophecy", "Transcendence", "Faith"],
      weapons: [["Acolyte's Staff", "Staff of the Devout", "Staff of Prophecy", "Benediction", "Anathema"]] },
    { id: 7, key: "shaman", name: "Shaman", armor: "mail", color: "#0070DE",
      sets: ["Primal", "Elements", "Earthfury", "Ten Storms", "Earthshatter"],
      weapons: [["Spiked Club", "Mace of the Elements", "Earthfury Hammer", "Blackwing Mace", "Doomhammer"],
                ["Round Buckler", "Crested Shield", "Totem Shield", "Aegis of the Ten Storms", "Shield of the Earthshatter"]] },
    { id: 8, key: "mage", name: "Mage", armor: "cloth", color: "#69CCF0",
      sets: ["Apprentice's", "Magister's", "Arcanist", "Netherwind", "Frostfire"],
      weapons: [["Apprentice's Staff", "Magister's Staff", "Arcanist's Staff", "Staff of Dominance", "Atiesh, Greatstaff of the Guardian"]] },
    { id: 9, key: "warlock", name: "Warlock", armor: "cloth", color: "#9482C9",
      sets: ["Novice's", "Dreadmist", "Felheart", "Nemesis", "Plagueheart"],
      weapons: [["Novice's Staff", "Dreadmist Staff", "Felheart Staff", "Staff of the Shadow Flame", "Atiesh, Greatstaff of the Guardian"]] },
    { id: 11, key: "druid", name: "Druid", armor: "leather", color: "#FF7D0A",
      sets: ["Thicket", "Wildheart", "Cenarion", "Stormrage", "Dreamwalker"],
      weapons: [["Gnarled Staff", "Wildheart Staff", "Cenarion Staff", "Staff of the Moon", "Atiesh, Greatstaff of the Guardian"]] },
  ];

  const NOUNS = {
    cloth: ["Circlet", "Mantle", "Robes", "Belt", "Leggings", "Boots", "Bindings", "Gloves"],
    leather: ["Cover", "Spaulders", "Chestpiece", "Belt", "Pants", "Boots", "Bracers", "Gloves"],
    mail: ["Helm", "Spaulders", "Breastplate", "Belt", "Legguards", "Greaves", "Bracers", "Gauntlets"],
    plate: ["Helm", "Pauldrons", "Breastplate", "Girdle", "Legplates", "Sabatons", "Bracers", "Gauntlets"],
  };

  /** Armor pieces 0–7 map to these equip slots (verified against real saves). */
  const ARMOR_SLOTS = [[0, "Head"], [2, "Shoulder"], [4, "Chest"], [5, "Waist"], [6, "Legs"], [7, "Feet"], [8, "Wrist"], [9, "Hands"]];

  const RARITY = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const HEROIC = ["–", "I", "II", "III", "IV", "V"];

  /** Zone keys from the game. The order after Feralas is not confirmed. */
  const ZONES = [
    ["elwynn", "Elwynn Forest"], ["duskwood", "Duskwood"], ["wsg", "Warsong Gulch"], ["ungoro", "Un'Goro Crater"],
    ["ab", "Arathi Basin"], ["feralas", "Feralas"], ["arena", "Gurubashi Arena"], ["sm", "Scarlet Monastery"],
    ["av", "Alterac Valley"], ["brm", "Blackrock Mountain"], ["aq", "Gates of Ahn'Qiraj"], ["naxx", "Naxxramas"],
  ];

  const STATS = { kills: "Kills", gold: "Gold", guardians: "Guardians", bosses: "Bosses", runs: "Runs", wins: "Wins", caches: "Caches", marks: "Marks (lifetime)" };
  const PERKS = { banish: "Banish", opening: "Opening", rerolls: "Rerolls", skip: "Skip", veteran: "Veteran" };

  const OF_SETS = new Set(["Valor", "Might", "Wrath", "Prophecy", "Transcendence", "Elements", "Ten Storms"]);
  const armorName = (set, noun) => (OF_SETS.has(set) ? `${noun} of ${set}` : `${set} ${noun}`);

  /**
   * All gear pieces of a class. Piece 8 is the first weapon, piece 9 the second.
   * `inferred: true` marks equip slots that were derived, not seen in a real save.
   */
  function pieces(cls) {
    const armor = ARMOR_SLOTS.map(([slot, label], i) => ({
      piece: i, slot, label, inferred: false,
      names: cls.sets.map((s) => armorName(s, NOUNS[cls.armor][i])),
    }));
    const ranged = cls.key === "hunter";
    const weapons = cls.weapons.map((names, w) => ({
      piece: 8 + w,
      slot: w === 0 ? (ranged ? 17 : 15) : 16,
      label: w === 0 ? (ranged ? "Ranged" : "Main Hand") : "Off Hand",
      inferred: ranged || w === 1,
      names,
    }));
    return armor.concat(weapons);
  }

  const byId = (id) => CLASSES.find((c) => c.id === id);

  return { CLASSES, NOUNS, ARMOR_SLOTS, RARITY, HEROIC, ZONES, STATS, PERKS, pieces, byId };
});
