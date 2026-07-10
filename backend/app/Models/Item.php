<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Item extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'sku', 'category_id', 'cost', 'price', 'stock', 'low_stock', 'color', 'image'];

    protected $casts = [
        'cost' => 'decimal:2',
        'price' => 'decimal:2',
    ];

    protected $appends = ['margin_pct', 'status', 'image_url'];

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function saleItems()
    {
        return $this->hasMany(SaleItem::class);
    }

    public function adjustments()
    {
        return $this->hasMany(StockAdjustment::class);
    }

    public function getMarginPctAttribute(): int
    {
        if ((float) $this->price <= 0) return 0;
        return (int) round((($this->price - $this->cost) / $this->price) * 100);
    }

    public function getStatusAttribute(): string
    {
        if ($this->stock <= 0) return 'out';
        if ($this->stock <= $this->low_stock) return 'low';
        return 'ok';
    }

    public function getImageUrlAttribute(): ?string
    {
        return $this->image ? Storage::disk('public')->url($this->image) : null;
    }
}
