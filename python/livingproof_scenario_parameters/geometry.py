# SPDX-License-Identifier: Apache-2.0
"""Route length, distance to a route, exit crossing and the route follower.

``route_length`` matches ``routeLength`` in ``tooling/world-layout.mjs``.
``distance_to_route`` and ``crosses_exit`` match ``distanceToRoute`` and
``crossesExit`` there, and the cases in
``specs/scenarios/route-geometry-cases.json``. ``follow_route`` matches
``followRoute`` and the cases in ``specs/scenarios/route-follower-cases.json``.
"""

import math

from livingproof_scenario_parameters.parameters import ScenarioParameterError

EPS = 1e-9

def _fail(message):
    raise ScenarioParameterError(message)

def _xy(point):
    return (point[0], point[1])

def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])

def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1]

def _len(vector):
    # sqrt(x*x + y*y), not math.hypot: the four IEEE 754 operations give the same bits as
    # Math.sqrt(x * x + y * y) in tooling/world-layout.mjs. hypot routines differ in the
    # last bit between Python and V8 (and across Python versions), which can move a
    # distance across a rounded limit such as 0.49.
    return math.sqrt(vector[0] * vector[0] + vector[1] * vector[1])

def _nearest_on_leg(point, start, end):
    """Nearest point on the finite segment start-end. Returns distance and fraction."""
    leg = _sub(end, start)
    fraction = max(0.0, min(1.0, _dot(_sub(point, start), leg) / _dot(leg, leg)))
    nearest = (start[0] + fraction * leg[0], start[1] + fraction * leg[1])
    return _len(_sub(point, nearest)), fraction

def _station_of(points, point):
    """Distance along the finite polyline from its first point to the point nearest ``point``."""
    best_distance, best_station, walked = math.inf, 0.0, 0.0
    query = _xy(point)
    for index in range(len(points) - 1):
        start, end = _xy(points[index]), _xy(points[index + 1])
        distance, fraction = _nearest_on_leg(query, start, end)
        leg_length = _len(_sub(end, start))
        if distance < best_distance - EPS:
            best_distance = distance
            best_station = walked + fraction * leg_length
        walked += leg_length
    return best_distance, best_station, walked

def route_length(world, places):
    """Distance along the route from the point nearest the start pose to the route's last point.

    ``places`` is the parameter file's places object and must name ``start`` and ``route``.
    The layout contract puts the route's last point on the exit reference point.
    """
    named = {place['name']: place for place in world['places']}
    route = named[places['route']]
    _distance, station, length = _station_of(route['points'], named[places['start']]['position'])
    return length - station

def distance_to_route(points, point):
    """Floor-plane distance from ``point`` to the route polyline.

    The first leg extends backward past the route start and the last leg extends
    forward past the route end, so a point just past the exit is measured sideways.
    A route of one leg is that line in both directions. Interior ends of the first
    and last legs are not extended, and every middle leg stays a finite segment.
    """
    route = [_xy(item) for item in points]
    query = _xy(point)
    legs = len(route) - 1
    if legs < 1:
        _fail('route needs at least 2 points')
    best = math.inf
    for index in range(legs):
        start, end = route[index], route[index + 1]
        leg = _sub(end, start)
        denom = _dot(leg, leg)
        if denom == 0:
            distance = _len(_sub(query, start))
        else:
            fraction = _dot(_sub(query, start), leg) / denom
            if legs != 1:
                if index == 0:
                    fraction = min(fraction, 1.0)
                elif index == legs - 1:
                    fraction = max(fraction, 0.0)
                else:
                    fraction = min(1.0, max(0.0, fraction))
            nearest = (start[0] + fraction * leg[0], start[1] + fraction * leg[1])
            distance = _len(_sub(query, nearest))
        if distance < best:
            best = distance
    return best

def crosses_exit(p0, p1, points, exit):
    """Whether the step from ``p0`` to ``p1`` crosses the exit segment.

    ``u`` is the direction of the route's last leg. The exit line passes through
    the exit reference and is perpendicular to ``u``. The step crosses when
    ``p0`` is strictly before that line and ``p1`` is on or past it, and the
    second sample is within half the segment's length of the reference along
    the segment (endpoints included): ``|dot(p1 - ref, u_perp)| <= half``.
    The point where the step meets the line is not tested. A step that starts
    already on or past the line does not cross again: that arrival belongs to
    the earlier step, and a first sample already past the line is judged on
    its own, not as a step. Landing on the line counts. ``exit`` is
    ``{"points": [a, b], "reference": midpoint}``; a missing reference is the
    midpoint of the two points. On hallway-open this is ``x >= 3`` with
    ``|y| <= 0.75`` at the second sample.
    """
    if len(points) < 2:
        _fail('route needs at least 2 points')
    start, end = _xy(points[-2]), _xy(points[-1])
    leg = _sub(end, start)
    if _dot(leg, leg) == 0:
        _fail('route last leg has zero length')
    edge_start, edge_end = _xy(exit['points'][0]), _xy(exit['points'][1])
    edge = _sub(edge_end, edge_start)
    edge_length = _len(edge)
    if edge_length == 0:
        _fail('exit segment has zero length')
    # along_unit is u_perp: the unit vector along the exit segment.
    along_unit = (edge[0] / edge_length, edge[1] / edge_length)
    reference = exit.get('reference')
    if reference is None:
        reference = ((edge_start[0] + edge_end[0]) / 2, (edge_start[1] + edge_end[1]) / 2)
    else:
        reference = _xy(reference)
    # normal is u, the direction of the last leg, when the segment is perpendicular
    # to that leg. The exit line is the line through the segment, perpendicular to u.
    normal_left = (-along_unit[1], along_unit[0])
    normal_right = (along_unit[1], -along_unit[0])
    normal = normal_left if _dot(normal_left, leg) > 0 else normal_right
    if _dot(normal, leg) == 0:
        _fail("exit line is parallel to the route's last leg")

    def signed(sample):
        return _dot(_sub(_xy(sample), reference), normal)

    before, after = signed(p0), signed(p1)
    if not (before < 0 <= after):
        return False
    # Lateral test on the second sample, along the segment. Not the meeting point.
    offset = _dot(_sub(_xy(p1), reference), along_unit)
    return abs(offset) <= edge_length / 2

def point_along_route(points, station):
    """Point at distance ``station`` along the route from its first point.

    Past the last point it continues straight along the last leg; before the first
    point it is the first point. Matches ``pointAlongRoute`` in ``tooling/world-layout.mjs``.
    """
    route = [_xy(item) for item in points]
    if len(route) < 2:
        _fail('route needs at least 2 points')
    walked = 0.0
    for index in range(len(route) - 1):
        start, end = route[index], route[index + 1]
        length = _len(_sub(end, start))
        if station <= walked + length:
            fraction = 0.0 if length == 0 else max(0.0, station - walked) / length
            return (start[0] + fraction * (end[0] - start[0]), start[1] + fraction * (end[1] - start[1]))
        walked += length
    start, end = route[-2], route[-1]
    length = _len(_sub(end, start))
    if length == 0:
        _fail('route last leg has zero length')
    extra = station - walked
    return (end[0] + extra * (end[0] - start[0]) / length, end[1] + extra * (end[1] - start[1]) / length)

def follow_route(points, base, yaw, forward, lookahead, max_turn_rate, sideways=0.0):
    """One control step of command mode ``route-follower``, rule ``pure-pursuit-v1``.

    Returns ``[forward, sideways, turn_rate]`` from the base point and yaw (radians).
    ``s`` is the station of the base point on the route, ``q`` the point ``lookahead``
    further along it, ``alpha`` the heading to ``q`` minus ``yaw`` wrapped to
    ``[-pi, pi)``, and ``turn_rate = 2 * forward * sin(alpha) / lookahead`` clamped to
    ``[-max_turn_rate, max_turn_rate]``. On a straight route with the base on it and
    facing along it the command is exactly ``[forward, sideways, 0]``. Matches
    ``followRoute`` in ``tooling/world-layout.mjs`` and the cases in
    ``specs/scenarios/route-follower-cases.json``.
    """
    if not lookahead > 0:
        _fail('lookahead must be greater than 0')
    if not max_turn_rate > 0:
        _fail('max_turn_rate must be greater than 0')
    point = _xy(base)
    _distance, station, _length = _station_of(points, point)
    target = point_along_route(points, station + lookahead)
    raw = math.atan2(target[1] - point[1], target[0] - point[0]) - yaw
    alpha = raw - 2 * math.pi * math.floor((raw + math.pi) / (2 * math.pi))
    turn = max(-max_turn_rate, min(max_turn_rate, 2 * forward * math.sin(alpha) / lookahead))
    return [forward, sideways, 0.0 if turn == 0 else turn]
