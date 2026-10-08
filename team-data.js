/* ---------------------------------------------------------------------------
   TEAM PAGE DATA  -  edit this file to add or change staff. No other code needed.

   rank:   "owner" | "manager" | "admin" | "mod" | "helper"   (decides the group)
   role:   the title shown on the badge (e.g. "Head Moderator")
   photo:  path to a photo you upload into the /team folder (square works best),
           e.g. "team/steve.jpg". If the file is missing, a coloured initial is shown.
   links:  optional - youtube, twitch, twitter, instagram, tiktok, github, website
           (must start with https://)
   hidden: set to true to hide someone without deleting their entry
--------------------------------------------------------------------------- */
window.TEAM = [
  {
    name: "Azuriffy",
    role: "Founder & Creator",
    rank: "owner",
    bio: "Founder of Azuriffy's Studio. Makes the scripted Minecraft videos and built the Discord bot and this website.",
    photo: "team/azuriffy.png",
    links: { youtube: "https://www.youtube.com/@azuriffy" }
  }

  /* Copy a block like this for each person (don't forget the comma between entries):
  ,{
    name: "Their Name",
    role: "Head Moderator",
    rank: "mod",
    bio: "One or two sentences about them.",
    photo: "team/their-name.jpg",
    links: { youtube: "https://www.youtube.com/@theirchannel" }
  }
  */
];
