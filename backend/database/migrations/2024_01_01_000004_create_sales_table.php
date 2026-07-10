<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('subtotal', 10, 2);
            $table->decimal('discount_pct', 5, 2)->default(0);
            $table->decimal('discount', 10, 2)->default(0);
            $table->decimal('total', 10, 2);
            $table->enum('payment_method', ['cash', 'card'])->default('cash');
            $table->decimal('tendered', 10, 2)->default(0);
            $table->decimal('change_due', 10, 2)->default(0);
            $table->boolean('refunded')->default(false);
            $table->timestamps(); // created_at is the sale timestamp; sales are never deleted
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
