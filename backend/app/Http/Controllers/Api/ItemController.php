<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\StockAdjustment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    public function index(Request $request)
    {
        $q = $request->query('q');

        $items = Item::with('category:id,name')
            ->when($q, fn ($query) => $query->where(function ($w) use ($q) {
                $w->where('name', 'like', "%{$q}%")->orWhere('sku', 'like', "%{$q}%");
            }))
            ->orderBy('name')
            ->get();

        return response()->json($items);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'sku' => 'required|string|max:64|unique:items,sku',
            'category_id' => 'nullable|exists:categories,id',
            'cost' => 'required|numeric|min:0',
            'price' => 'required|numeric|min:0',
            'stock' => 'required|integer|min:0',
            'low_stock' => 'required|integer|min:0',
            'color' => 'nullable|string|max:7',
        ]);

        return response()->json(Item::create($data)->load('category:id,name'), 201);
    }

    public function update(Request $request, Item $item)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'sku' => ['required', 'string', 'max:64', Rule::unique('items', 'sku')->ignore($item->id)],
            'category_id' => 'nullable|exists:categories,id',
            'cost' => 'required|numeric|min:0',
            'price' => 'required|numeric|min:0',
            'low_stock' => 'required|integer|min:0',
            'color' => 'nullable|string|max:7',
            // stock is intentionally NOT editable here — use /adjust so every
            // change is captured in the stock_adjustments audit trail.
        ]);

        $item->update($data);

        return response()->json($item->load('category:id,name'));
    }

    public function destroy(Item $item)
    {
        if ($item->image) {
            Storage::disk('public')->delete($item->image);
        }

        $item->delete();
        return response()->json(['ok' => true]);
    }

    /** Upload or replace an item's photo, shown on the Sell screen. */
    public function uploadImage(Request $request, Item $item)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,jpg,png,webp,gif|max:4096',
        ]);

        if ($item->image) {
            Storage::disk('public')->delete($item->image);
        }

        $item->update(['image' => $request->file('image')->store('items', 'public')]);

        return response()->json($item->load('category:id,name'));
    }

    /** Advanced inventory: receive delivery / physical recount / damage-waste, fully audited. */
    public function adjust(Request $request, Item $item)
    {
        $data = $request->validate([
            'reason' => ['required', Rule::in(['receive', 'recount', 'damage'])],
            'qty' => 'required|integer',
        ]);

        $before = $item->stock;
        $after = match ($data['reason']) {
            'receive' => $before + abs($data['qty']),
            'damage' => max(0, $before - abs($data['qty'])),
            'recount' => max(0, $data['qty']),
        };

        $item->update(['stock' => $after]);

        StockAdjustment::create([
            'item_id' => $item->id,
            'employee_id' => $request->input('employee_id'),
            'reason' => $data['reason'],
            'before_qty' => $before,
            'after_qty' => $after,
        ]);

        return response()->json($item->load('category:id,name'));
    }

    /** Stats for the Inventory screen header. */
    public function stats()
    {
        $items = Item::all();

        return response()->json([
            'count' => $items->count(),
            'low' => $items->filter(fn ($i) => $i->stock > 0 && $i->stock <= $i->low_stock)->count(),
            'out' => $items->filter(fn ($i) => $i->stock <= 0)->count(),
            'stock_value' => round($items->sum(fn ($i) => $i->cost * max(0, $i->stock)), 2),
        ]);
    }
}
