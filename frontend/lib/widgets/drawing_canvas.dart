import 'package:flutter/material.dart';
import 'dart:convert';

List<Map<String, List<double>>> normalizeReference(List<dynamic> strokes) {
  double minX = double.infinity;
  double minY = double.infinity;
  double maxX = -double.infinity;
  double maxY = -double.infinity;

  List<Map<String, List<double>>> cleaned = [];

  // ✅ LIMPIAR DATOS
  for (var s in strokes) {
    if (s == null || s['x'] == null || s['y'] == null) continue;

    final xsRaw = s['x'];
    final ysRaw = s['y'];

    List<double> xs = [];
    List<double> ys = [];

    for (int i = 0; i < xsRaw.length && i < ysRaw.length; i++) {
      final x = xsRaw[i];
      final y = ysRaw[i];

      if (x == null || y == null) continue;

      xs.add((x as num).toDouble());
      ys.add((y as num).toDouble());
    }

    if (xs.length < 2 || ys.length < 2) continue;

    cleaned.add({"x": xs, "y": ys});
  }

  // ✅ evitar división por cero
  if (cleaned.isEmpty) return [];

  // calcular bounds
  for (var s in cleaned) {
    for (var x in s['x']!) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    for (var y in s['y']!) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  final size = (maxX - minX) > (maxY - minY)
      ? (maxX - minX)
      : (maxY - minY);

  if (size == 0) return cleaned;

  return cleaned.map((s) {
    return {
      "x": s['x']!.map((x) => (x - minX) / size).toList(),
      "y": s['y']!.map((y) => (y - minY) / size).toList(),
    };
  }).toList();
}

class DrawingCanvas extends StatefulWidget {
  final String? solutionKanji;
  const DrawingCanvas({
    super.key,
    this.solutionKanji,
  });

  @override
  DrawingCanvasState createState() => DrawingCanvasState();
}

class DrawingCanvasState extends State<DrawingCanvas> {
  
  List<List<Offset>> strokes = [];
  List<Offset> currentStroke = [];


  void clear() {
    setState(() {
      strokes.clear();
      currentStroke.clear();
    });
  }

  
List<Map<String, dynamic>> convertirStrokes() {
  List<Map<String, dynamic>> resultado = [];

  final todos = [...strokes];

  if (currentStroke.isNotEmpty) {
    todos.add(currentStroke);
  }

  for (var stroke in todos) {
    List<double> xs = [];
    List<double> ys = [];

    for (var p in stroke) {
      xs.add(p.dx);
      ys.add(p.dy);
    }

    resultado.add({
      "x": xs,
      "y": ys,
    });
  }

  return resultado;
}


  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: (details) {
        final RenderBox box = context.findRenderObject() as RenderBox;

        currentStroke = [
          box.globalToLocal(details.globalPosition),
        ];
      },
      onPanUpdate: (details) {
        final RenderBox box = context.findRenderObject() as RenderBox;

        setState(() {
          currentStroke.add(
            box.globalToLocal(details.globalPosition),
          );
        });
      },
      onPanEnd: (_) {
        setState(() {
          strokes.add(List.from(currentStroke));
          currentStroke.clear();
        });
        //print('Número de strokes: ${strokes.length}');
        //print(strokes);
        
        debugPrint('--- STROKES CONVERTIDOS ---');
        debugPrint(jsonEncode(convertirStrokes()));

      },
      child: Container(
        color: Colors.grey[200],
        width: double.infinity,
        height: 400,
        child: CustomPaint(
        painter: CanvasPainter(
          strokes,
          currentStroke,
          solutionKanji: widget.solutionKanji
        ),
      ),
      ),
    );
  }
}


class CanvasPainter extends CustomPainter {
  final List<List<Offset>> strokes;
  final List<Offset> currentStroke;
  final String? solutionKanji;

  CanvasPainter(
    this.strokes,
    this.currentStroke,
    {this.solutionKanji});

  @override
  void paint(Canvas canvas, Size size) {
    final canvasSize = size.shortestSide;
    final paint = Paint()
      ..color = Colors.black
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
      
    //test new
    if (solutionKanji != null && solutionKanji!.isNotEmpty) {
      final textPainter = TextPainter(
        text: TextSpan(
          text: solutionKanji,
          style: TextStyle(
            fontSize: canvasSize * 0.6,
            color: Colors.grey.withAlpha(51), // ✅ transparente
            fontWeight: FontWeight.bold,
          ),
        ),
        textDirection: TextDirection.ltr,
      );

      textPainter.layout();

      final dx = (size.width - textPainter.width) / 2;
      final dy = (size.height - textPainter.height) / 2;

      final offset = Offset(
        dx.clamp(0, size.width),
        dy.clamp(0, size.height),
      );


      textPainter.paint(canvas, offset);
    }
    //end test new



    // Dibujar trazos terminados
    for (var stroke in strokes) {
      for (int i = 0; i < stroke.length - 1; i++) {
        canvas.drawLine(stroke[i], stroke[i + 1], paint);
      }
    }

    // Dibujar trazo actual
    for (int i = 0; i < currentStroke.length - 1; i++) {
      canvas.drawLine(currentStroke[i], currentStroke[i + 1], paint);
    }
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => true;
}