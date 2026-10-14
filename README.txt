POCKET ARCADE - SETUP BEFORE UPLOADING

1) FIND AND REPLACE in ALL files (most code editors: "Replace in files"):
   pocket-arcade.games    -> your real domain, e.g. pocketarcade.fun
   you@example.com    -> the email visitors should contact
   0000000000000000   -> your AdSense publisher number (digits after "pub-")

2) UPLOAD every file in this folder to the ROOT of your site, so these work:
   https://your-domain/            (home)
   https://your-domain/snake.html  (each game has its own page)
   https://your-domain/ads.txt
   https://your-domain/sitemap.xml

3) GOOGLE SEARCH CONSOLE (free, search.google.com/search-console)
   - Add your domain and verify it.
   - Sitemaps > submit:  sitemap.xml
   - URL inspection > request indexing for the home page and a few game pages.
   Pages usually start appearing in Google within days to a few weeks.

4) ADSENSE, after approval:
   - Create ad units and replace the placeholder slot numbers:
       1111111111 and 2222222222  -> index.html
       3333333333                 -> every game page
     Ad boxes that still hold a placeholder slot number are hidden
     automatically, so nothing broken shows while you set this up.
     (Or leave the placeholders and turn on Auto ads instead.)
   - Turn on Privacy & messaging > European regulations message
     (Google's free consent popup, required for EU/UK visitors).

FILES
   index.html, *.html game pages   the site
   arcade.css, arcade.js           shared design and game code (cached once)
   (pages load them as arcade.js?v=NUMBER; bump the number on every update
    so phones fetch the new version instead of a cached copy)
   og-image.png                    picture shown when the link is shared
   favicon.svg, icon-*.png         browser and home-screen icons
   site.webmanifest                lets phones "Add to Home Screen"
   robots.txt, sitemap.xml         for search engines
   ads.txt                         for AdSense
