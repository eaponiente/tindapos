<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\SaleController;
use Illuminate\Support\Facades\Route;

// Auth / clock in-out
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout']);

// Employees & timesheet
Route::get('/employees', [EmployeeController::class, 'index']);
Route::post('/employees', [EmployeeController::class, 'store']);
Route::put('/employees/{employee}', [EmployeeController::class, 'update']);
Route::delete('/employees/{employee}', [EmployeeController::class, 'destroy']);
Route::get('/shifts', [EmployeeController::class, 'shifts']);

// Categories
Route::get('/categories', [CategoryController::class, 'index']);
Route::post('/categories', [CategoryController::class, 'store']);
Route::put('/categories/{category}', [CategoryController::class, 'update']);
Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);

// Inventory
Route::get('/items', [ItemController::class, 'index']);
Route::get('/items/stats', [ItemController::class, 'stats']);
Route::post('/items', [ItemController::class, 'store']);
Route::put('/items/{item}', [ItemController::class, 'update']);
Route::delete('/items/{item}', [ItemController::class, 'destroy']);
Route::post('/items/{item}/adjust', [ItemController::class, 'adjust']);
Route::post('/items/{item}/image', [ItemController::class, 'uploadImage']);

// Sales / unlimited history / refunds
Route::get('/sales', [SaleController::class, 'index']);
Route::get('/sales/stats', [SaleController::class, 'stats']);
Route::get('/sales/{sale}', [SaleController::class, 'show']);
Route::post('/sales', [SaleController::class, 'store']);
Route::post('/sales/{sale}/refund', [SaleController::class, 'refund']);
