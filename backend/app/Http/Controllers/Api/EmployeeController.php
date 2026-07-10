<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Shift;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    public function index()
    {
        $employees = Employee::withCount(['sales as receipts_count' => function ($q) {
                $q->where('refunded', false);
            }])
            ->withSum(['sales as sales_total' => function ($q) {
                $q->where('refunded', false);
            }], 'total')
            ->get()
            ->map(function ($e) {
                $last = Shift::where('employee_id', $e->id)->latest('clock_in')->first();
                $e->last_clock_in = $last?->clock_in;
                return $e;
            });

        return response()->json($employees);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'pin' => 'required|digits:4|unique:employees,pin',
            'role' => ['required', Rule::in(['cashier', 'manager', 'owner'])],
        ]);

        return response()->json(Employee::create($data), 201);
    }

    public function update(Request $request, Employee $employee)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'pin' => ['required', 'digits:4', Rule::unique('employees', 'pin')->ignore($employee->id)],
            'role' => ['required', Rule::in(['cashier', 'manager', 'owner'])],
        ]);

        $employee->update($data);

        return response()->json($employee);
    }

    public function destroy(Employee $employee)
    {
        $employee->delete();
        return response()->json(['ok' => true]);
    }

    /** Latest 30 shift punches, for the timesheet table. */
    public function shifts()
    {
        return response()->json(
            Shift::with('employee:id,name')->latest('clock_in')->limit(30)->get()
        );
    }
}
