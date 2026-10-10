delete from candidates
where post_id in (
  select id from posts
  where title in (
    'Who will be the next president 2027',
    'Which Squid Game season is the best',
    'Which current footballer is balling right now'
  )
);

delete from posts
where title in (
  'Who will be the next president 2027',
  'Which Squid Game season is the best',
  'Which current footballer is balling right now'
);

insert into posts (title, display_order, is_active)
values
  ('Who will be the next president 2027', 1, true),
  ('Which Squid Game season is the best', 2, true),
  ('Which current footballer is balling right now', 3, true);

insert into candidates (post_id, name, image_url, display_order, is_active)
select p.id, c.name, c.image_url, c.display_order, true
from posts p
join (
  values
    ('Who will be the next president 2027', 'Bola-Ahmed Tinubu', 'https://commons.wikimedia.org/wiki/Special:FilePath/Bola%20Tinubu%20portrait.jpg', 1),
    ('Who will be the next president 2027', 'Peter Obi', 'https://commons.wikimedia.org/wiki/Special:FilePath/Peter%20Obi%202022.jpg', 2),
    ('Who will be the next president 2027', 'Atiku Abubakar', 'https://commons.wikimedia.org/wiki/Special:FilePath/Atiku%20Abubakar%202023.jpg', 3),
    ('Which Squid Game season is the best', 'Season 1', 'https://commons.wikimedia.org/wiki/Special:FilePath/Squid_Game_season_1_poster.png', 1),
    ('Which Squid Game season is the best', 'Season 2', 'https://commons.wikimedia.org/wiki/Special:FilePath/Squid_Game_season_2_poster.png', 2),
    ('Which Squid Game season is the best', 'Season 3', 'https://commons.wikimedia.org/wiki/Special:FilePath/Squid%20Game%203%20Logo.svg', 3),
    ('Which current footballer is balling right now', 'Michael Olise', 'https://commons.wikimedia.org/wiki/Special:FilePath/Olise%202022%20crystal%20palace.jpg', 1),
    ('Which current footballer is balling right now', 'Khvicha Kvaratskhelia', 'https://commons.wikimedia.org/wiki/Special:FilePath/Khvicha%20Kvaratskhelia%20cropped.jpg', 2),
    ('Which current footballer is balling right now', 'Lamine Yamal', 'https://commons.wikimedia.org/wiki/Special:FilePath/Lamine%20Yamal%20%282025%29.png', 3)
) as c(post_title, name, image_url, display_order)
on p.title = c.post_title;
