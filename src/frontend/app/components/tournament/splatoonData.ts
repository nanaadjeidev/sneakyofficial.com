export interface Stage {
  name: string;
  image: string;
}

export interface Mode {
  id: string;
  name: string;
  icon: string;
}

export const STAGES: Stage[] = [
  { name: "Scorch Gorge",         image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/1/1c/S3_Stage_Scorch_Gorge.png/300px-S3_Stage_Scorch_Gorge.png" },
  { name: "Eeltail Alley",        image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/7/7d/S3_Stage_Eeltail_Alley.png/300px-S3_Stage_Eeltail_Alley.png" },
  { name: "Hagglefish Market",    image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/a/ad/S3_Stage_Hagglefish_Market.png/300px-S3_Stage_Hagglefish_Market.png" },
  { name: "Undertow Spillway",    image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/a/ad/S3_Stage_Undertow_Spillway.png/300px-S3_Stage_Undertow_Spillway.png" },
  { name: "Mincemeat Metalworks", image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/d/d1/S3_Stage_Mincemeat_Metalworks.png/300px-S3_Stage_Mincemeat_Metalworks.png" },
  { name: "Hammerhead Bridge",    image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/9/94/S3_Stage_Hammerhead_Bridge.png/300px-S3_Stage_Hammerhead_Bridge.png" },
  { name: "Museum d'Alfonsino",   image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/6a/S3_Stage_Museum_d'Alfonsino.png/300px-S3_Stage_Museum_d'Alfonsino.png" },
  { name: "Mahi-Mahi Resort",     image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/6b/S3_Stage_Mahi-Mahi_Resort.png/300px-S3_Stage_Mahi-Mahi_Resort.png" },
  { name: "Inkblot Art Academy",  image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/4/45/S3_Stage_Inkblot_Art_Academy.png/300px-S3_Stage_Inkblot_Art_Academy.png" },
  { name: "Sturgeon Shipyard",    image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/4/45/S3_Stage_Sturgeon_Shipyard.png/300px-S3_Stage_Sturgeon_Shipyard.png" },
  { name: "MakoMart",             image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/4/47/S3_Stage_MakoMart.png/300px-S3_Stage_MakoMart.png" },
  { name: "Wahoo World",          image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/7/71/S3_Stage_Wahoo_World.png/300px-S3_Stage_Wahoo_World.png" },
  { name: "Brinewater Springs",   image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/f/fc/S3_Stage_Brinewater_Springs.png/300px-S3_Stage_Brinewater_Springs.png" },
  { name: "Flounder Heights",     image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/2/23/S3_Stage_Flounder_Heights.png/300px-S3_Stage_Flounder_Heights.png" },
  { name: "Um'ami Ruins",         image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/9/95/S3_Stage_Um'ami_Ruins.png/300px-S3_Stage_Um'ami_Ruins.png" },
  { name: "Manta Maria",          image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/8/86/S3_Stage_Manta_Maria.png/300px-S3_Stage_Manta_Maria.png" },
  { name: "Barnacle & Dime",      image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/2/2a/S3_Stage_Barnacle_&_Dime.png/300px-S3_Stage_Barnacle_&_Dime.png" },
  { name: "Humpback Pump Track",  image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/5/57/S3_Stage_Humpback_Pump_Track.png/300px-S3_Stage_Humpback_Pump_Track.png" },
  { name: "Crableg Capital",      image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/b/bb/S3_Stage_Crableg_Capital.png/300px-S3_Stage_Crableg_Capital.png" },
  { name: "Shipshape Cargo Co.",  image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/8/8b/S3_Stage_Shipshape_Cargo_Co..png/300px-S3_Stage_Shipshape_Cargo_Co..png" },
  { name: "Robo ROM-en",          image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/9/92/S3_Stage_Robo_ROM-en.png/300px-S3_Stage_Robo_ROM-en.png" },
  { name: "Bluefin Depot",        image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/6/69/S3_Stage_Bluefin_Depot.png/300px-S3_Stage_Bluefin_Depot.png" },
  { name: "Marlin Airport",       image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/b/b6/S3_Stage_Marlin_Airport.png/300px-S3_Stage_Marlin_Airport.png" },
  { name: "Lemuria Hub",          image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/2/22/S3_Stage_Lemuria_Hub.png/300px-S3_Stage_Lemuria_Hub.png" },
  { name: "Urchin Underpass",     image: "https://cdn.wikimg.net/en/splatoonwiki/images/thumb/f/fa/S3_Stage_Urchin_Underpass.png/300px-S3_Stage_Urchin_Underpass.png" },
];

export const MODES: Mode[] = [
  {
    id: "turf_war",
    name: "Turf War",
    icon: "https://cdn.wikimg.net/en/splatoonwiki/images/d/d0/S3_Turf_War_icon.svg",
  },
  {
    id: "splat_zones",
    name: "Splat Zones",
    icon: "https://cdn.wikimg.net/en/splatoonwiki/images/3/38/S3_icon_Splat_Zones.png",
  },
  {
    id: "tower_control",
    name: "Tower Control",
    icon: "https://cdn.wikimg.net/en/splatoonwiki/images/b/bc/S3_icon_Tower_Control.png",
  },
  {
    id: "rainmaker",
    name: "Rainmaker",
    icon: "https://cdn.wikimg.net/en/splatoonwiki/images/1/12/S3_icon_Rainmaker.png",
  },
  {
    id: "clam_blitz",
    name: "Clam Blitz",
    icon: "https://cdn.wikimg.net/en/splatoonwiki/images/e/e3/S3_icon_Clam_Blitz.png",
  },
];
