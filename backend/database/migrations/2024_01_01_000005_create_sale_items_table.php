<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');   // snapshot, survives item edits/deletes
            $table->decimal('price', 10, 2);
            $table->integer('qty');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_items');
    }
};
