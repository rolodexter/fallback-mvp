/**
 * Debug script for router issues with Z001 June snapshot
 * Copy and paste into browser console
 */

// Directly test the router with exact canonical prompt
const message = "Z001 June snapshot";
console.log("Testing exact message:", message);
console.log("Message lowercase:", message.toLowerCase());
console.log("Includes 'z001':", message.toLowerCase().includes('z001'));
console.log("Includes 'june':", message.toLowerCase().includes('june'));
