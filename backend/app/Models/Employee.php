<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'pin', 'role'];

    protected $hidden = []; // PIN is intentionally not hidden: owner/manager screens display it for staff management

    public function sales()
    {
        return $this->hasMany(Sale::class);
    }

    public function shifts()
    {
        return $this->hasMany(Shift::class);
    }

    public function roleRank(): int
    {
        return match ($this->role) {
            'owner' => 2,
            'manager' => 1,
            default => 0,
        };
    }
}
