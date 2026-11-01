# The RSE1 save export format

This describes the text the game produces under **Options → Saves → download** (`AzerothSurvivors <date>.sav`)
and accepts on import. Everything here was worked out from the public web client, build `d1eb6005e172`
(`wenilla_bg.wasm`). A later game update may change any of it.

Confidence markers used below: **verified** (checked against the client code or real saves),
**observed** (seen in real saves, meaning inferred from values), **guess**.

## Envelope (verified)

```
"RSE1:" + base64( nonce[16] || ciphertext || tag[20] )
```

| Part | Size | Content |
|---|---|---|
| `nonce` | 16 bytes | random per export, so the same save never exports to the same string twice |
| `ciphertext` | same length as the plaintext | plaintext XOR keystream |
| `tag` | 20 bytes | HMAC-SHA1 over the nonce and ciphertext |

With the fixed 42-byte key

```
K = "azeroth-survivors/save/v1/" (26 ASCII bytes) || 9c 4e 27 d1 6a f0 13 b8 5d e2 71 0c a9 36 c4 8f
```

the keystream and tag are

```
block_i = HMAC-SHA1(K, "ks"  || nonce || uint64_le(i))     i = 0, 1, 2, …   (20 bytes each)
tag     = HMAC-SHA1(K, "tag" || nonce || ciphertext)
```

There is no compression. The key is the same for every player and ships inside the client, so this
protects against accidental damage and casual edits. It does not keep anything secret.

Both strings sit next to each other in the WASM data section (`…ksazeroth-survivors/save/v1/<16 bytes>RSE1:`).
In the client, function 3643 builds the HMAC from the label and the 16 bytes, function 18939 runs the
20-byte keystream loop with the `"ks"` domain string, and function 2902 checks the `RSE1:` prefix on import.

## Plaintext

UTF-8 text, one record per line, each line ending in `\n`. Fields are separated by `|`.
Lists inside a field are comma-separated; pairs use `:` or `=` depending on the record.

**Per-class records** carry the class id as their second field. **Account records** do not.

### Class ids (verified)

| id | class | | id | class |
|---|---|---|---|---|
| 1 | Warrior | | 7 | Shaman |
| 2 | Paladin | | 8 | Mage |
| 3 | Hunter | | 9 | Warlock |
| 4 | Rogue | | 11 | Druid |
| 5 | Priest | | | |

### Item ids (observed)

```
id = 100000 + class * 1000 + piece * 100 + rarity * 10
```

| piece | gear | equip slot |
|---|---|---|
| 0–7 | head, shoulder, chest, waist, legs, feet, wrist, hands | 0, 2, 4, 5, 6, 7, 8, 9 (observed) |
| 8 | first weapon | 15 main hand (observed); 17 ranged for Hunters (guess) |
| 9 | second weapon: Rogue off-hand dagger, Shaman shield | 16 off hand (guess) |

Rarity 0–4: Common, Uncommon, Rare, Epic, Legendary. Each class has one armor set per rarity.
Example: `101820` is the Warrior's (1) first weapon (8) at Rare (2): Blackhand Doomsaw.

### Records

| Record | Scope | Shape | Meaning |
|---|---|---|---|
| `pick` | class | `pick\|cls\|race\|gender\|zone\|name\|a,b,c,d,e\|n` | hero and zone last chosen on the select screen (observed); the last field is unknown |
| `open` | class | `open\|cls\|zone` | a zone opened for this class (guess) |
| `items` | account | `items\|id,id,…` | collection: every piece owned, all classes (observed) |
| `equip` | class | `equip\|cls\|slot:id,…` | worn gear (observed) |
| `look` | class | `look\|cls\|slot:display,…` | appearance overrides, e.g. `18:90004` for the tabard slot (observed) |
| `talent` | class | `talent\|cls\|xp\|key:rank,…` | talent experience and learned ranks (observed) |
| `spec` | class | `spec\|cls\|n\|key:rank,…\|\|` | saved talent layout (observed) |
| `seen` | account | `seen\|key=rarity,…` | codex: highest rarity seen per jewel/ability (observed) |
| `ach` | account | `ach\|key,…` | achievements earned (observed) |
| `achat` | account | `achat\|key=unixtime,…` | when each achievement was earned, Unix seconds (observed) |
| `stat` | account | `stat\|kills=…,gold=…,guardians=…,bosses=…,runs=…,wins=…,caches=…,marks=…` | lifetime statistics (observed) |
| `beat` | class | `beat\|cls\|zone,…` | zones beaten on normal (observed) |
| `perk` | account | `perk\|key:level,…` | account perks (observed) |
| `hero` | class | `hero\|cls\|race\|gender\|a,b,c,d,e` | a created hero and its appearance (observed) |
| `marks` | class | `marks\|cls\|n` | marks, spent on star upgrades (observed) |
| `stars` | account | `stars\|id:n,…` | star upgrades per item, 0–5 (observed) |
| `pity` | account | `pity\|id:n,…` | per-item counters, probably drop protection (guess) |
| `glow` | class | `glow\|cls\|n` | weapon glow choice (guess) |
| `hbeat` | class | `hbeat\|cls\|zone:level,…` | highest heroic level beaten per zone, 1–5 (observed) |

Zone keys: `elwynn`, `duskwood`, `wsg`, `ungoro`, `ab`, `feralas`, `arena`, `sm`, `av`, `brm`, `aq`, `naxx`.

## What the game checks on import

Unknown. The client verifies the tag before it accepts a file. Whether it also checks game rules
(stars above the unlocked heroic level, items of a class without a hero, and so on) has not been tested.
Keep a copy of your original export.
