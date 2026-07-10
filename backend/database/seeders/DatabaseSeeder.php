<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Employee;
use App\Models\Item;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        Employee::insert([
            ['name' => 'Maria Santos', 'pin' => '1234', 'role' => 'owner', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Jun Dela Cruz', 'pin' => '2222', 'role' => 'manager', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'Liza Ramos', 'pin' => '3333', 'role' => 'cashier', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $catNames = ['Coffee', 'Pastry', 'Meals', 'Drinks', 'Retail'];
        $cats = collect($catNames)->mapWithKeys(fn ($n) => [$n => Category::create(['name' => $n])->id]);

        $items = [
            ['Kapeng Barako', 'BRK-01', 'Coffee', 45, 110, 10, 3, '#6B4226'],
            ['Iced Latte', 'LAT-02', 'Coffee', 50, 140, 10, 3, '#8C6849'],
            ['Spanish Latte', 'LAT-03', 'Coffee', 55, 150, 10, 3, '#A5764B'],
            ['Ensaymada', 'ENS-01', 'Pastry', 22, 65, 8, 3, '#E0A94E'],
            ['Pan de Coco', 'PDC-01', 'Pastry', 15, 45, 8, 3, '#C98F3C'],
            ['Cheese Roll', 'CHR-01', 'Pastry', 20, 55, 8, 3, '#D9B65C'],
            ['Chicken Adobo Rice', 'ADB-01', 'Meals', 70, 165, 5, 2, '#7D5A3C'],
            ['Sisig Bowl', 'SSG-01', 'Meals', 80, 185, 5, 2, '#8A4B3B'],
            ['Pancit Canton', 'PCT-01', 'Meals', 55, 130, 5, 2, '#B4763A'],
            ['Calamansi Juice', 'CLJ-01', 'Drinks', 18, 70, 12, 4, '#7FA23C'],
            ['Bottled Water', 'H2O-01', 'Drinks', 8, 25, 24, 6, '#4C8FB4'],
            ['Mango Shake', 'MGS-01', 'Drinks', 35, 95, 6, 2, '#E2A72E'],
            ['Tote Bag', 'TOT-01', 'Retail', 120, 299, 4, 1, '#4E6E58'],
            ['Coffee Beans 250g', 'BNS-01', 'Retail', 210, 420, 4, 1, '#3E3128'],
        ];

        foreach ($items as [$name, $sku, $cat, $cost, $price, $stock, $low, $color]) {
            Item::create([
                'name' => $name, 'sku' => $sku, 'category_id' => $cats[$cat],
                'cost' => $cost, 'price' => $price, 'stock' => $stock, 'low_stock' => $low, 'color' => $color,
            ]);
        }
    }
}
