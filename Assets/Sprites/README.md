# Asset Sprites Folder
This folder is where you should put the final "Karu", "Gas Phantom", and "Coral" sprites. 

For now, the logic scripts use Godot's built-in `_draw()` method to procedurally generate colored dots so you can test the game mechanics immediately without needing to import any images! 
- **Karu (Player):** Cyan Dot
- **Enemy (Target):** Sickly Green Dot
- **Thermal Vent:** Orange Dot

When you have your real art:
1. Drag the `.png` files here.
2. In your Godot scenes, assign the texture to a `Sprite2D` node.
3. Open the `PlayerController.gd`, `TargetableEnemy.gd`, and `ThermalVent.gd` scripts, and simply delete the `func _draw():` block inside them so the dots go away!
