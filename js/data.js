const TC = {
  normal:   {bg:'#6b6b5e', text:'#e8e8d8'},
  fire:     {bg:'#c0521a', text:'#ffe8d0'},
  water:    {bg:'#1a4fa0', text:'#d0e8ff'},
  electric: {bg:'#b89000', text:'#fff8c0'},
  grass:    {bg:'#2d7a2d', text:'#d0f0d0'},
  ice:      {bg:'#2a8888', text:'#c8f0f0'},
  fighting: {bg:'#8a1a1a', text:'#ffd8d8'},
  poison:   {bg:'#6a1a8a', text:'#f0d0ff'},
  ground:   {bg:'#8a6a10', text:'#fff0c0'},
  flying:   {bg:'#4a3a9a', text:'#e0d8ff'},
  psychic:  {bg:'#a01a5a', text:'#ffd0e8'},
  bug:      {bg:'#4a5a10', text:'#e8f0b0'},
  rock:     {bg:'#6a5a18', text:'#f0e8c0'},
  ghost:    {bg:'#3a2a6a', text:'#ddd0ff'},
  dragon:   {bg:'#2a0a9a', text:'#d0c8ff'},
  dark:     {bg:'#2a2018', text:'#d8d0c0'},
  steel:    {bg:'#3a3a5a', text:'#d8d8f0'},
  fairy:    {bg:'#902050', text:'#ffd0e0'},
};

const typeChart = {
  normal:   {rock:0.5, ghost:0, steel:0.5},
  fire:     {fire:0.5, water:0.5, rock:0.5, dragon:0.5, grass:2, ice:2, bug:2, steel:2},
  water:    {water:0.5, grass:0.5, dragon:0.5, fire:2, ground:2, rock:2},
  electric: {electric:0.5, grass:0.5, ground:0, dragon:0.5, flying:2, water:2},
  grass:    {fire:0.5, grass:0.5, poison:0.5, flying:0.5, bug:0.5, dragon:0.5, steel:0.5, water:2, ground:2, rock:2, ice:2},
  ice:      {fire:0.5, water:0.5, ice:0.5, steel:0.5, fighting:2, rock:2},
  fighting: {bug:0.5, rock:2, steel:2, ice:2, dark:2, normal:2, ghost:0, flying:0.5, poison:0.5, psychic:0.5, fairy:0.5},
  poison:   {grass:2, fairy:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0},
  ground:   {poison:2, rock:2, steel:2, fire:2, electric:2, grass:0.5, bug:0.5, water:2, ice:2, flying:0},
  flying:   {electric:2, ice:2, rock:2, grass:2, bug:2, fighting:2, ground:0},
  psychic:  {psychic:0.5, fighting:2, ghost:2, dark:2, steel:0.5},
  bug:      {fire:0.5, flying:0.5, rock:0.5, ghost:0.5, steel:0.5, fighting:0.5, grass:2},
  rock:     {normal:2, fire:2, flying:2, ice:2, bug:2, fighting:0.5, ground:0.5, steel:0.5},
  ghost:    {normal:0, fighting:0, ghost:2, dark:2, poison:0.5, bug:0.5},
  dragon:   {ice:2, dragon:2, fairy:2, fire:0.5, water:0.5, grass:0.5, electric:0.5},
  dark:     {ghost:2, psychic:2, dark:0.5, fighting:0.5, fairy:0.5, bug:2},
  steel:    {fire:2, fighting:2, ground:2, normal:0.5, flying:0.5, rock:0.5, bug:0.5, grass:0.5, psychic:0.5, ice:0.5, dragon:0.5, fairy:0.5, poison:0, electric:0.5, steel:0.5},
  fairy:    {fighting:2, dragon:0, dark:2, fire:0.5, poison:0.5, steel:0.5, bug:0.5},
};

const GEN_OVERRIDES = {
  1: {fairy:null, dark:null, steel:null},
  2: {fairy:null},
  3: {fairy:null},
  4: {fairy:null},
  5: {fairy:null},
};

const GEN_VGS = {
  1: ['red-blue','yellow'],
  2: ['gold-silver','crystal'],
  3: ['ruby-sapphire','emerald','firered-leafgreen'],
  4: ['diamond-pearl','platinum','heartgold-soulsilver'],
  5: ['black-white','black-2-white-2'],
  6: ['x-y','omega-ruby-alpha-sapphire'],
  7: ['sun-moon','ultra-sun-ultra-moon'],
  8: ['sword-shield','brilliant-diamond-and-shining-pearl'],
  9: ['scarlet-violet'],
};

const REL_ABILITIES = {
  'levitate':       {immune:['ground']},
  'flash-fire':     {immune:['fire']},
  'volt-absorb':    {immune:['electric']},
  'water-absorb':   {immune:['water']},
  'storm-drain':    {immune:['water']},
  'earth-eater':    {immune:['ground']},
  'dry-skin':       {immune:['water'], weak:['fire']},
  'sap-sipper':     {immune:['grass']},
  'motor-drive':    {immune:['electric']},
  'lightning-rod':  {immune:['electric']},
  'well-baked-body':{immune:['fire']},
  'wind-rider':     {immune:['flying']},
  'purifying-salt': {immune:['ghost']},
  'heatproof':      {halve:['fire']},
  'thick-fat':      {halve:['fire','ice']},
  'wonder-guard':   {special:'wonderguard'},
};

const FORM_SUFFIXES = ['-mega','-mega-x','-mega-y','-gmax','-primal','-origin','-therian','-black','-white','-resolute','-pirouette','-ash','-eternamax'];
const FORM_LABELS = {
  '-mega':'Mega', '-mega-x':'Mega X', '-mega-y':'Mega Y', '-gmax':'G-Max',
  '-primal':'Primal', '-origin':'Origin', '-therian':'Therian', '-black':'Black',
  '-white':'White', '-resolute':'Resolute', '-pirouette':'Pirouette', '-ash':'Ash',
  '-eternamax':'Eternamax',
};

const STAT_CONFIG = [
  {key:'hp',             label:'HP',    color:'#4caf50'},
  {key:'attack',         label:'Atk',   color:'#f44336'},
  {key:'defense',        label:'Def',   color:'#ff9800'},
  {key:'special-attack', label:'SpAtk', color:'#2196f3'},
  {key:'special-defense',label:'SpDef', color:'#9c27b0'},
  {key:'speed',          label:'Speed', color:'#e91e63'},
];
const STAT_MAX = 255;

const MOVE_TABS = [
  {key:'level-up',    label:'Level Up'},
  {key:'machine',     label:'TM / HM'},
  {key:'egg',         label:'Breeding'},
  {key:'tutor',       label:'Tutor'},
  {key:'form-change', label:'Prior Evo'},
];

// Pokemon whose default form in PokéAPI has a suffix (e.g. giratina-altered).
// Maps canonical display name → actual PokéAPI /pokemon/{name} endpoint.
const API_NAME_MAP = {
  'giratina':  'giratina-altered',
  'tornadus':  'tornadus-incarnate',
  'thundurus': 'thundurus-incarnate',
  'landorus':  'landorus-incarnate',
  'enamorus':  'enamorus-incarnate',
  'basculin':  'basculin-red-striped',
  'meloetta':  'meloetta-aria',
  'keldeo':    'keldeo-ordinary',
};
// Reverse: 'giratina-altered' → 'giratina'
const API_NAME_MAP_REVERSE = Object.fromEntries(
  Object.entries(API_NAME_MAP).map(([k, v]) => [v, k])
);
