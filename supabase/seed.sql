-- Demo data — same as the original Laravel DatabaseSeeder.
-- Run once after 00001_init.sql. Change the PINs before real use!

insert into employees (name, pin, role) values
  ('Maria Santos', '1234', 'owner'),
  ('Jun Dela Cruz', '2222', 'manager'),
  ('Liza Ramos', '3333', 'cashier');

insert into categories (name) values
  ('Coffee'), ('Pastry'), ('Meals'), ('Drinks'), ('Retail');

insert into items (name, sku, category_id, cost, price, stock, low_stock, color) values
  ('Kapeng Barako',     'BRK-01', (select id from categories where name = 'Coffee'), 45, 110, 10, 3, '#6B4226'),
  ('Iced Latte',        'LAT-02', (select id from categories where name = 'Coffee'), 50, 140, 10, 3, '#8C6849'),
  ('Spanish Latte',     'LAT-03', (select id from categories where name = 'Coffee'), 55, 150, 10, 3, '#A5764B'),
  ('Ensaymada',         'ENS-01', (select id from categories where name = 'Pastry'), 22,  65,  8, 3, '#E0A94E'),
  ('Pan de Coco',       'PDC-01', (select id from categories where name = 'Pastry'), 15,  45,  8, 3, '#C98F3C'),
  ('Cheese Roll',       'CHR-01', (select id from categories where name = 'Pastry'), 20,  55,  8, 3, '#D9B65C'),
  ('Chicken Adobo Rice','ADB-01', (select id from categories where name = 'Meals'),  70, 165,  5, 2, '#7D5A3C'),
  ('Sisig Bowl',        'SSG-01', (select id from categories where name = 'Meals'),  80, 185,  5, 2, '#8A4B3B'),
  ('Pancit Canton',     'PCT-01', (select id from categories where name = 'Meals'),  55, 130,  5, 2, '#B4763A'),
  ('Calamansi Juice',   'CLJ-01', (select id from categories where name = 'Drinks'), 18,  70, 12, 4, '#7FA23C'),
  ('Bottled Water',     'H2O-01', (select id from categories where name = 'Drinks'),  8,  25, 24, 6, '#4C8FB4'),
  ('Mango Shake',       'MGS-01', (select id from categories where name = 'Drinks'), 35,  95,  6, 2, '#E2A72E'),
  ('Tote Bag',          'TOT-01', (select id from categories where name = 'Retail'),120, 299,  4, 1, '#4E6E58'),
  ('Coffee Beans 250g', 'BNS-01', (select id from categories where name = 'Retail'),210, 420,  4, 1, '#3E3128');
