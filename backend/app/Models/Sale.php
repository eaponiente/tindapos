<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id', 'subtotal', 'discount_pct', 'discount', 'total',
        'payment_method', 'tendered', 'change_due', 'refunded',
    ];

    protected $casts = [
        'refunded' => 'boolean',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function items()
    {
        return $this->hasMany(SaleItem::class);
    }
}
