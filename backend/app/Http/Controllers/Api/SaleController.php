<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SaleController extends Controller
{
    /** Unlimited sales history — paginated so the API stays fast no matter how many years of receipts pile up. */
    public function index(Request $request)
    {
        $q = $request->query('q');
        $employeeId = $request->query('employee_id');

        $sales = Sale::with(['employee:id,name', 'items'])
            ->when($employeeId, fn ($query) => $query->where('employee_id', $employeeId))
            ->when($q, fn ($query) => $query->where(function ($w) use ($q) {
                $w->where('id', 'like', "%{$q}%")
                    ->orWhereHas('items', fn ($li) => $li->where('name', 'like', "%{$q}%"));
            }))
            ->latest()
            ->paginate(50);

        return response()->json($sales);
    }

    /** Summary stats for the History screen header. */
    public function stats()
    {
        $todayStart = now()->startOfDay();

        return response()->json([
            'receipts_count' => Sale::count(),
            'today_total' => (float) Sale::where('refunded', false)->where('created_at', '>=', $todayStart)->sum('total'),
            'all_time_total' => (float) Sale::where('refunded', false)->sum('total'),
        ]);
    }

    public function show(Sale $sale)
    {
        return response()->json($sale->load(['employee:id,name', 'items']));
    }

    /** Checkout. Validates stock, decrements it, and records the sale — all inside one transaction. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'employee_id' => 'required|exists:employees,id',
            'discount_pct' => 'nullable|numeric|min:0|max:100',
            'payment_method' => ['required', Rule::in(['cash', 'card'])],
            'tendered' => 'required|numeric|min:0',
            'lines' => 'required|array|min:1',
            'lines.*.item_id' => 'required|exists:items,id',
            'lines.*.qty' => 'required|integer|min:1',
        ]);

        return DB::transaction(function () use ($data) {
            $items = Item::whereIn('id', collect($data['lines'])->pluck('item_id'))
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $subtotal = 0;
            foreach ($data['lines'] as $line) {
                $item = $items[$line['item_id']];
                if ($item->stock < $line['qty']) {
                    throw ValidationException::withMessages(['stock' => "Not enough stock for {$item->name}"]);
                }
                $subtotal += (float) $item->price * $line['qty'];
            }

            $discountPct = $data['discount_pct'] ?? 0;
            $discount = round($subtotal * $discountPct / 100, 2);
            $total = round($subtotal - $discount, 2);

            if ($data['tendered'] < $total) {
                throw ValidationException::withMessages(['tendered' => 'Amount tendered is less than the total']);
            }

            $sale = Sale::create([
                'employee_id' => $data['employee_id'],
                'subtotal' => $subtotal,
                'discount_pct' => $discountPct,
                'discount' => $discount,
                'total' => $total,
                'payment_method' => $data['payment_method'],
                'tendered' => $data['tendered'],
                'change_due' => round($data['tendered'] - $total, 2),
                'refunded' => false,
            ]);

            foreach ($data['lines'] as $line) {
                $item = $items[$line['item_id']];
                SaleItem::create([
                    'sale_id' => $sale->id,
                    'item_id' => $item->id,
                    'name' => $item->name,
                    'price' => $item->price,
                    'qty' => $line['qty'],
                ]);
                $item->decrement('stock', $line['qty']);
            }

            return response()->json($sale->load(['employee:id,name', 'items']), 201);
        });
    }

    /** Refund: flags the sale and returns every line's quantity back to stock. */
    public function refund(Sale $sale)
    {
        if ($sale->refunded) {
            return response()->json(['message' => 'Already refunded'], 422);
        }

        DB::transaction(function () use ($sale) {
            foreach ($sale->items as $line) {
                if ($line->item_id) {
                    Item::whereKey($line->item_id)->increment('stock', $line->qty);
                }
            }
            $sale->update(['refunded' => true]);
        });

        return response()->json($sale->load(['employee:id,name', 'items']));
    }
}
