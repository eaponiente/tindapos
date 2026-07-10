<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Shift;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    /** PIN clock-in. Opens a new shift and returns the employee. */
    public function login(Request $request)
    {
        $data = $request->validate([
            'pin' => 'required|digits:4',
        ]);

        $employee = Employee::where('pin', $data['pin'])->first();

        if (!$employee) {
            return response()->json(['message' => 'Wrong PIN'], 422);
        }

        $shift = Shift::create([
            'employee_id' => $employee->id,
            'clock_in' => now(),
        ]);

        return response()->json([
            'employee' => $employee,
            'shift_id' => $shift->id,
        ]);
    }

    /** Clock-out: closes the employee's latest open shift. */
    public function logout(Request $request)
    {
        $data = $request->validate([
            'employee_id' => 'required|exists:employees,id',
        ]);

        $shift = Shift::where('employee_id', $data['employee_id'])
            ->whereNull('clock_out')
            ->latest('clock_in')
            ->first();

        if ($shift) {
            $shift->update(['clock_out' => now()]);
        }

        return response()->json(['ok' => true]);
    }
}
